from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Final
from uuid import UUID, uuid4

from anyio import to_thread
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.i18n import normalize_language, t
from app.models import (
    PURCHASE_PAID,
    PURCHASE_PENDING,
    AddonPurchase,
    AddonResource,
    ManualPlanGrant,
    StripeEvent,
    StudyProject,
    SubscriptionInvoice,
    SubscriptionPlan,
    User,
    UserSubscription,
)
from app.models.study_project import SLOT_OCCUPYING_STATUSES
from app.services.addons import billing_cycle_window
from app.services.audit import add_audit_log
from app.services.email import (
    EmailDeliveryError,
    EmailMessage,
    EmailService,
    addon_invoice_paid_email,
    email_logo_html,
    invoice_paid_email,
)
from app.services.subscription_status import (
    ACTIVE_SUBSCRIPTION_STATUSES,
    CHECKOUT_SUBSCRIPTION_STATUSES,
    INACTIVE_SUBSCRIPTION_STATUSES,
)

logger = logging.getLogger("revizzio.stripe")

# Upper bound on a single re-sync, so one account cannot page through
# Stripe indefinitely.
_MAX_LISTED_SUBSCRIPTIONS = 500




class StripeConfigurationError(Exception):
    pass


class StripeRequestError(Exception):
    def __init__(
        self,
        message: str,
        *,
        error_code: str | None = None,
        error_param: str | None = None,
    ) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.error_param = error_param

    @property
    def is_stale_customer(self) -> bool:
        return self.error_code == "resource_missing" and self.error_param == "customer"


class StripeSignatureError(Exception):
    pass


class StripePlanUnavailableError(Exception):
    pass


@dataclass(frozen=True)
class CheckoutSessionResult:
    checkout_url: str
    session_id: str


def _timestamp(value: object) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except (TypeError, ValueError, OSError):
        return None


def _stripe_form(data: dict[str, str]) -> bytes:
    return urllib.parse.urlencode(data).encode("utf-8")


# Stripe delivers far more event types than the ones acted on here. The full
# payload of every delivery is already kept in `stripe_events`; the audit log
# only carries the ones that move money or entitlements, so it stays readable.
AUDITED_WEBHOOK_EVENTS: frozenset[str] = frozenset(
    {
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_succeeded",
        "invoice.payment_failed",
    }
)


def _webhook_details(event_type: str, data: dict[str, Any]) -> dict[str, Any]:
    """The few fields worth reading back, never the whole payload.

    `stripe_events` already stores the delivery verbatim, so copying it here
    would multiply the largest column in the database for no added answer.
    """
    if event_type.startswith("checkout.session"):
        return {
            "mode": _string_or_none(data.get("mode")),
            "payment_status": _string_or_none(data.get("payment_status")),
            "amount_total": data.get("amount_total"),
            "currency": _string_or_none(data.get("currency")),
            "subscription": _string_or_none(data.get("subscription")),
        }

    if event_type.startswith("customer.subscription"):
        return {
            "status": _string_or_none(data.get("status")),
            "cancel_at_period_end": data.get("cancel_at_period_end"),
            "canceled_at": data.get("canceled_at"),
        }

    return {
        "number": _string_or_none(data.get("number")),
        "billing_reason": _string_or_none(data.get("billing_reason")),
        "amount_due": data.get("amount_due"),
        "amount_paid": data.get("amount_paid"),
        "currency": _string_or_none(data.get("currency")),
        "attempt_count": data.get("attempt_count"),
    }


def _webhook_resource_id(event_type: str, data: dict[str, Any]) -> str | None:
    return _string_or_none(data.get("id")) or _string_or_none(
        data.get("subscription") if event_type.startswith("invoice") else None
    )


# The locales Stripe Checkout knows. An unrecognised value is rejected with a
# 400, which would take payment down rather than merely showing the wrong
# language. Today every language the app supports is in here, so the guard
# only bites if a new one is added that Stripe does not know: that language
# then gets "auto" and Stripe reads the browser, instead of no checkout.
STRIPE_CHECKOUT_LOCALES: Final[frozenset[str]] = frozenset(
    {
        "auto", "bg", "cs", "da", "de", "el", "en", "en-GB", "es", "es-419",
        "et", "fi", "fil", "fr", "fr-CA", "hr", "hu", "id", "it", "ja", "ko",
        "lt", "lv", "ms", "mt", "nb", "nl", "pl", "pt", "pt-BR", "ro", "ru",
        "sk", "sl", "sv", "th", "tr", "vi", "zh", "zh-HK", "zh-TW",
    }
)


def _checkout_locale(user: User) -> str:
    """Show Stripe's own page in the language the account chose.

    The account setting is used rather than the browser: it is the language the
    user picked deliberately, and it is what every email and invoice from us
    already uses, so the payment page stops being the odd one out.
    """
    language = normalize_language(user.language_preference)
    return language if language in STRIPE_CHECKOUT_LOCALES else "auto"


def _uuid_or_none(value: object) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


def _string_or_none(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _int_or_zero(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _invoice_line_items(invoice: dict[str, Any]) -> list[tuple[str, str]]:
    """Description and amount per line, worded the way Stripe billed them.

    Taking them from the invoice rather than from our own order means the
    email can never disagree with the document it links to.
    """
    lines = (invoice.get("lines") or {}).get("data") or []
    currency = str(invoice.get("currency") or "RON").upper()

    items: list[tuple[str, str]] = []
    for line in lines:
        if not isinstance(line, dict):
            continue

        description = _string_or_none(line.get("description")) or "-"
        # Stripe's description is the product name alone, so the quantity has
        # to be added: "Credite AI" says nothing about how many were bought.
        quantity = _int_or_zero(line.get("quantity"))
        if quantity > 1:
            description = f"{description} × {quantity}"

        amount = _int_or_zero(line.get("amount")) / 100
        # Same comma decimals as the invoice total, so one email cannot show
        # two different number formats.
        formatted = f"{amount:.2f}".replace(".", ",")
        items.append((description, f"{formatted} {currency}"))
    return items


def _format_invoice_amount(invoice: SubscriptionInvoice) -> str:
    amount = invoice.amount_paid if invoice.amount_paid > 0 else invoice.amount_due
    normalized = f"{amount / 100:.2f}".replace(".", ",")
    return f"{normalized} {invoice.currency.upper()}"


def _format_invoice_paid_at(invoice: SubscriptionInvoice) -> str | None:
    if invoice.paid_at is None:
        return None
    return invoice.paid_at.astimezone(UTC).strftime("%d.%m.%Y, %H:%M")


def _trim_delivery_error(error: Exception) -> str:
    message = str(error).strip() or error.__class__.__name__
    return message[:1000]


class StripeClient:
    def __init__(self, settings: Settings) -> None:
        if settings.stripe_secret_key is None:
            raise StripeConfigurationError("STRIPE_SECRET_KEY nu este configurat.")
        self._api_base_url = settings.stripe_api_base_url.rstrip("/")
        self._secret_key = settings.stripe_secret_key.get_secret_value()

    async def create_customer(self, *, user: User) -> dict[str, Any]:
        return await to_thread.run_sync(
            self._request,
            "POST",
            "/customers",
            {
                "email": user.email,
                "name": user.full_name,
                "metadata[user_id]": str(user.id),
            },
        )

    async def create_checkout_session(
        self,
        *,
        user: User,
        plan: SubscriptionPlan,
        customer_id: str,
        success_url: str,
        cancel_url: str,
        replaces_subscription_id: str | None = None,
    ) -> dict[str, Any]:
        if not plan.stripe_price_id:
            raise StripePlanUnavailableError("Planul nu are stripe_price_id.")

        data = {
            "mode": "subscription",
            "customer": customer_id,
            "client_reference_id": str(user.id),
            "line_items[0][price]": plan.stripe_price_id,
            "line_items[0][quantity]": "1",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "allow_promotion_codes": "true",
            "locale": _checkout_locale(user),
            "metadata[user_id]": str(user.id),
            "metadata[plan_id]": str(plan.id),
            "metadata[plan_slug]": plan.slug,
            "subscription_data[metadata][user_id]": str(user.id),
            "subscription_data[metadata][plan_id]": str(plan.id),
            "subscription_data[metadata][plan_slug]": plan.slug,
        }
        if replaces_subscription_id is not None:
            data["metadata[replaces_subscription_id]"] = replaces_subscription_id
            data["subscription_data[metadata][replaces_subscription_id]"] = (
                replaces_subscription_id
            )

        return await to_thread.run_sync(
            self._request,
            "POST",
            "/checkout/sessions",
            data,
        )

    async def create_addon_checkout_session(
        self,
        *,
        user: User,
        purchase_id: UUID,
        line_items: list[tuple[str, int]],
        customer_id: str,
        success_url: str,
        cancel_url: str,
    ) -> dict[str, Any]:
        """A one-off basket, not a subscription.

        Each entry is a Stripe Price and a quantity, so Stripe multiplies and
        totals the order. We never send an amount we computed ourselves, which
        keeps the money arithmetic on Stripe's side of the line.
        """
        if not line_items:
            raise StripePlanUnavailableError("Cosul este gol.")

        data: dict[str, str] = {
            "mode": "payment",
            "customer": customer_id,
            "client_reference_id": str(user.id),
            "success_url": success_url,
            "cancel_url": cancel_url,
            "locale": _checkout_locale(user),
            "metadata[user_id]": str(user.id),
            # The basket lives on our order row; only its id travels, so Stripe
            # metadata limits can never truncate what was bought.
            "metadata[addon_purchase_id]": str(purchase_id),
            "payment_intent_data[metadata][user_id]": str(user.id),
            "payment_intent_data[metadata][addon_purchase_id]": str(purchase_id),
            # A payment-mode session raises no invoice unless asked. Without
            # this the customer gets a receipt but no document, while every
            # subscription charge produces a proper invoice.
            "invoice_creation[enabled]": "true",
            "invoice_creation[invoice_data][metadata][user_id]": str(user.id),
            "invoice_creation[invoice_data][metadata][addon_purchase_id]": str(
                purchase_id
            ),
        }
        for index, (price_id, quantity) in enumerate(line_items):
            data[f"line_items[{index}][price]"] = price_id
            data[f"line_items[{index}][quantity]"] = str(quantity)

        return await to_thread.run_sync(
            self._request,
            "POST",
            "/checkout/sessions",
            data,
        )

    async def retrieve_checkout_session(self, *, session_id: str) -> dict[str, Any]:
        safe_session_id = urllib.parse.quote(session_id, safe="")
        return await to_thread.run_sync(
            self._request,
            "GET",
            f"/checkout/sessions/{safe_session_id}",
            None,
        )

    async def retrieve_subscription(self, *, subscription_id: str) -> dict[str, Any]:
        safe_subscription_id = urllib.parse.quote(subscription_id, safe="")
        return await to_thread.run_sync(
            self._request,
            "GET",
            f"/subscriptions/{safe_subscription_id}",
            {"expand[]": "latest_invoice"},
        )

    async def retrieve_invoice(self, *, invoice_id: str) -> dict[str, Any]:
        safe_invoice_id = urllib.parse.quote(invoice_id, safe="")
        return await to_thread.run_sync(
            self._request,
            "GET",
            f"/invoices/{safe_invoice_id}",
            None,
        )

    async def list_customer_subscriptions(
        self,
        *,
        customer_id: str,
    ) -> list[dict[str, Any]]:
        """Every subscription Stripe holds for a customer, newest first.

        ``status=all`` is deliberate: a re-sync has to see canceled rows too,
        otherwise a subscription that ended in Stripe but stayed active here
        would never be corrected.
        """
        collected: list[dict[str, Any]] = []
        starting_after: str | None = None

        # Stripe caps a page at 100. A long-lived account can hold more than
        # that, and a partial list would settle the plan from an incomplete
        # history, so every page is followed.
        while len(collected) < _MAX_LISTED_SUBSCRIPTIONS:
            params = {"customer": customer_id, "status": "all", "limit": "100"}
            if starting_after is not None:
                params["starting_after"] = starting_after

            payload = await to_thread.run_sync(
                self._request,
                "GET",
                "/subscriptions",
                params,
            )
            data = payload.get("data")
            if not isinstance(data, list):
                break

            page = [item for item in data if isinstance(item, dict)]
            collected.extend(page)

            if not payload.get("has_more") or not page:
                break

            last_id = page[-1].get("id")
            if not isinstance(last_id, str) or not last_id:
                break
            starting_after = last_id

        return collected

    async def cancel_subscription(self, *, subscription_id: str) -> dict[str, Any]:
        safe_subscription_id = urllib.parse.quote(subscription_id, safe="")
        return await to_thread.run_sync(
            self._request,
            "DELETE",
            f"/subscriptions/{safe_subscription_id}",
            {"invoice_now": "false", "prorate": "false"},
        )

    async def update_subscription_cancellation(
        self,
        *,
        subscription_id: str,
        cancel_at_period_end: bool,
    ) -> dict[str, Any]:
        safe_subscription_id = urllib.parse.quote(subscription_id, safe="")
        return await to_thread.run_sync(
            self._request,
            "POST",
            f"/subscriptions/{safe_subscription_id}",
            {
                "cancel_at_period_end": (
                    "true" if cancel_at_period_end else "false"
                ),
                "proration_behavior": "none",
            },
        )

    def _request(
        self,
        method: str,
        path: str,
        data: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        url = f"{self._api_base_url}{path}"
        request_body: bytes | None = None
        if method == "GET" and data:
            url = f"{url}?{urllib.parse.urlencode(data)}"
        elif method != "GET":
            request_body = _stripe_form(data or {})

        request = urllib.request.Request(
            url,
            data=request_body,
            method=method,
            headers={
                "Authorization": f"Bearer {self._secret_key}",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Reviss/1.0",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            response_body = exc.read().decode("utf-8", errors="replace")
            error_payload: dict[str, Any] = {}
            try:
                error_payload = json.loads(response_body).get("error", {})
            except json.JSONDecodeError:
                pass
            logger.error(
                "Cerere Stripe esuata: %s %s -> %s %s",
                method,
                path,
                exc.code,
                response_body,
            )
            raise StripeRequestError(
                error_payload.get("message") or response_body,
                error_code=error_payload.get("code"),
                error_param=error_payload.get("param"),
            ) from exc
        except urllib.error.URLError as exc:
            logger.error(
                "Stripe nu a putut fi contactat: %s %s -> %s", method, path, exc
            )
            raise StripeRequestError("Stripe nu a putut fi contactat.") from exc


class StripePaymentService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self._session = session
        self._settings = settings
        self._email = EmailService(settings)
        # Subscriptions whose period backfill was already tried in this request,
        # so a row Stripe cannot resolve is not re-fetched on every read.
        self._period_backfill_attempted: set[str] = set()

    async def create_checkout_session(
        self,
        *,
        user: User,
        plan_slug: str,
        user_agent: str | None,
        ip_address: str | None,
    ) -> CheckoutSessionResult:
        plan = await self._session.scalar(
            select(SubscriptionPlan).where(
                SubscriptionPlan.slug == plan_slug,
                SubscriptionPlan.is_visible.is_(True),
            )
        )
        if plan is None or plan.price_ron <= 0:
            raise StripePlanUnavailableError("Planul nu este disponibil pentru plata.")
        if not plan.stripe_price_id:
            raise StripePlanUnavailableError(
                "Planul nu are configurat Price ID-ul Stripe."
            )

        active_subscriptions = await self._fetch_active_subscriptions(user=user)
        active_paid_subscription = next(
            (
                subscription
                for subscription in active_subscriptions
                if subscription.plan_id == plan.id
            ),
            None,
        )
        if active_paid_subscription is not None:
            raise StripePlanUnavailableError("Planul selectat este deja activ.")

        replaced_subscription = next(iter(active_subscriptions), None)

        stripe = StripeClient(self._settings)
        if not user.stripe_customer_id:
            customer_id = await self._create_stripe_customer(stripe, user=user)
        else:
            customer_id = user.stripe_customer_id

        try:
            checkout_session = await stripe.create_checkout_session(
                user=user,
                plan=plan,
                customer_id=customer_id,
                success_url=self._success_url(),
                cancel_url=self._cancel_url(),
                replaces_subscription_id=(
                    replaced_subscription.stripe_subscription_id
                    if replaced_subscription is not None
                    else None
                ),
            )
        except StripeRequestError as exc:
            if not exc.is_stale_customer:
                raise
            # The stored customer id was created under a different Stripe mode
            # (e.g. test vs live) and no longer exists — recreate it and retry.
            logger.warning(
                "Customer Stripe %s nu mai exista, recreez pentru user %s.",
                customer_id,
                user.id,
            )
            customer_id = await self._create_stripe_customer(stripe, user=user)
            checkout_session = await stripe.create_checkout_session(
                user=user,
                plan=plan,
                customer_id=customer_id,
                success_url=self._success_url(),
                cancel_url=self._cancel_url(),
                replaces_subscription_id=(
                    replaced_subscription.stripe_subscription_id
                    if replaced_subscription is not None
                    else None
                ),
            )
        checkout_url = str(checkout_session.get("url") or "")
        session_id = str(checkout_session.get("id") or "")
        if not checkout_url or not session_id:
            raise StripeRequestError("Stripe nu a returnat URL-ul de checkout.")

        add_audit_log(
            self._session,
            action="stripe.checkout_session.created",
            actor=user,
            resource_type="subscription_plan",
            resource_id=str(plan.id),
            details={
                "plan_slug": plan.slug,
                "stripe_price_id": plan.stripe_price_id,
                "stripe_checkout_session_id": session_id,
                "replaces_subscription_id": (
                    replaced_subscription.stripe_subscription_id
                    if replaced_subscription is not None
                    else None
                ),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()
        return CheckoutSessionResult(checkout_url=checkout_url, session_id=session_id)

    async def _create_stripe_customer(self, stripe: StripeClient, *, user: User) -> str:
        customer = await stripe.create_customer(user=user)
        customer_id = str(customer.get("id") or "")
        if not customer_id:
            raise StripeRequestError("Stripe nu a returnat customer id.")
        user.stripe_customer_id = customer_id
        await self._session.flush()
        return customer_id

    async def handle_webhook(
        self,
        *,
        payload: bytes,
        signature_header: str | None,
    ) -> None:
        event = self._verify_event(payload, signature_header)
        event_id = str(event.get("id") or "")
        event_type = str(event.get("type") or "")
        if not event_id or not event_type:
            raise StripeSignatureError("Eveniment Stripe invalid.")

        claimed_event_id = await self._session.scalar(
            pg_insert(StripeEvent)
            .values(
                id=event_id,
                type=event_type,
                payload=event,
                processed_at=datetime.now(UTC),
            )
            .on_conflict_do_nothing(index_elements=[StripeEvent.id])
            .returning(StripeEvent.id)
        )
        if claimed_event_id is None:
            return

        data_object = event.get("data", {}).get("object", {})
        audited = event_type in AUDITED_WEBHOOK_EVENTS

        # Captured as plain values before dispatch: the failure path rolls the
        # session back, which would expire an attached User and make the audit
        # entry for the failure itself raise.
        actor = await self._webhook_actor(data_object) if audited else None
        actor_fields = (
            {
                "actor_user_id": actor.id,
                "actor_email": actor.email,
                "actor_name": actor.full_name,
            }
            if actor is not None
            else {}
        )

        try:
            await self._dispatch_webhook_event(event_type, data_object)
        except Exception as exc:
            if not audited:
                raise
            # Stripe retries a failed delivery, so the event claim has to go
            # back with the rest of the work; only the record of the failure
            # is kept, in a transaction of its own.
            await self._session.rollback()
            add_audit_log(
                self._session,
                action=f"stripe.webhook.{event_type}",
                status="failure",
                resource_type="stripe_event",
                resource_id=event_id,
                details={
                    **_webhook_details(event_type, data_object),
                    "object_id": _webhook_resource_id(event_type, data_object),
                    "error": f"{type(exc).__name__}: {exc}",
                },
                **actor_fields,
            )
            await self._session.commit()
            raise

        if audited:
            add_audit_log(
                self._session,
                action=f"stripe.webhook.{event_type}",
                resource_type="stripe_event",
                resource_id=event_id,
                details={
                    **_webhook_details(event_type, data_object),
                    "object_id": _webhook_resource_id(event_type, data_object),
                    # A delivery nobody could be attached to is the shape of a
                    # payment that never reached an account.
                    "account_identified": actor is not None,
                },
                **actor_fields,
            )

        await self._session.commit()

    async def _dispatch_webhook_event(
        self,
        event_type: str,
        data_object: dict[str, Any],
    ) -> None:
        if event_type == "checkout.session.completed":
            await self._handle_checkout_completed(data_object)
        elif event_type in {
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
        }:
            await self._handle_subscription_event(data_object)
        elif event_type == "invoice.payment_failed":
            await self._handle_invoice_payment_failed(data_object)
        elif event_type == "invoice.paid":
            await self._handle_invoice_paid(data_object, send_email=True)
        elif event_type == "invoice.payment_succeeded":
            await self._handle_invoice_paid(data_object, send_email=False)

    async def _webhook_actor(self, data: dict[str, Any]) -> User | None:
        """Whose account the event belongs to, as far as the payload says.

        Metadata is tried first: on a brand new checkout the customer is not
        linked to the account yet, so the id is the only attribution there is.
        """
        metadata = data.get("metadata") or {}
        parsed_user_id = _uuid_or_none(metadata.get("user_id"))
        if parsed_user_id is None:
            parsed_user_id = _uuid_or_none(data.get("client_reference_id"))
        if parsed_user_id is not None:
            user = await self._session.get(User, parsed_user_id)
            if user is not None:
                return user

        customer_id = _string_or_none(data.get("customer"))
        if customer_id is None:
            return None
        return await self._session.scalar(
            select(User).where(User.stripe_customer_id == customer_id)
        )

    async def sync_completed_checkout_session(
        self,
        *,
        user: User,
        session_id: str,
        user_agent: str | None,
        ip_address: str | None,
    ) -> User:
        if not session_id.startswith("cs_"):
            raise StripePlanUnavailableError("Sesiunea Stripe este invalida.")

        stripe = StripeClient(self._settings)
        checkout_session = await stripe.retrieve_checkout_session(
            session_id=session_id,
        )
        if checkout_session.get("status") != "complete":
            raise StripePlanUnavailableError("Plata nu este finalizata in Stripe.")
        if checkout_session.get("payment_status") not in {
            "paid",
            "no_payment_required",
        }:
            raise StripePlanUnavailableError("Plata nu este confirmata in Stripe.")

        metadata = checkout_session.get("metadata") or {}
        session_user_id = metadata.get("user_id") or checkout_session.get(
            "client_reference_id"
        )
        if str(session_user_id) != str(user.id):
            raise StripePlanUnavailableError("Sesiunea nu apartine contului curent.")

        await self._handle_checkout_completed(checkout_session)
        stripe_subscription_id = _string_or_none(checkout_session.get("subscription"))
        if stripe_subscription_id is not None:
            # The session runs with autoflush=False, so the row just added by
            # _handle_checkout_completed is still pending. Without this flush the
            # lookup in _upsert_subscription below misses it and inserts a second
            # row with the same stripe_subscription_id, which the unique index
            # rejects at commit time.
            await self._session.flush()

            # _handle_checkout_completed can only write NULL periods -- the
            # checkout session does not carry them. Fetch the subscription so
            # current_period_start/end are stored right away.
            await self._sync_subscription_from_stripe(
                stripe_subscription_id=stripe_subscription_id,
            )
            await self._sync_latest_invoice_from_stripe(
                stripe=stripe,
                stripe_subscription_id=stripe_subscription_id,
                send_email_user=user,
            )
        add_audit_log(
            self._session,
            action="stripe.checkout_session.synced",
            actor=user,
            resource_type="stripe_checkout_session",
            resource_id=session_id,
            details={"payment_status": checkout_session.get("payment_status")},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()

        refreshed_user = await self._session.scalar(
            select(User)
            .options(selectinload(User.current_plan))
            .where(User.id == user.id)
            .execution_options(populate_existing=True)
        )
        return refreshed_user or user

    async def list_user_invoices(self, *, user: User) -> list[SubscriptionInvoice]:
        invoices = await self._fetch_user_invoices(user=user)
        if invoices:
            return invoices

        await self._sync_latest_invoices_for_user(user=user)
        await self._session.commit()
        return await self._fetch_user_invoices(user=user)

    async def _sync_subscription_from_stripe(
        self,
        *,
        stripe_subscription_id: str,
    ) -> None:
        """Refresh one subscription from Stripe through the webhook handler.

        Write path only: `_handle_subscription_event` also updates status and
        can cancel superseded subscriptions in Stripe, so this must never be
        reached from a request that only reads.
        """
        try:
            stripe = StripeClient(self._settings)
            subscription = await stripe.retrieve_subscription(
                subscription_id=stripe_subscription_id,
            )
        except (StripeConfigurationError, StripeRequestError):
            return

        await self._handle_subscription_event(subscription)

    async def _backfill_subscription_period(
        self,
        *,
        subscription: UserSubscription,
    ) -> bool:
        """Fill only the billing period columns of one subscription row.

        Read paths use this instead of `_sync_subscription_from_stripe`: it
        touches nothing but `current_period_start` / `current_period_end`, so a
        page load can never change a status or cancel anything in Stripe.
        Returns True when the row was updated.
        """
        stripe_subscription_id = subscription.stripe_subscription_id
        if stripe_subscription_id in self._period_backfill_attempted:
            return False
        self._period_backfill_attempted.add(stripe_subscription_id)

        try:
            stripe = StripeClient(self._settings)
            stripe_subscription = await stripe.retrieve_subscription(
                subscription_id=stripe_subscription_id,
            )
        except (StripeConfigurationError, StripeRequestError):
            # A read path must not fail because Stripe is unavailable or unset.
            return False

        period_start, period_end = self._subscription_period(stripe_subscription)
        if period_end is None:
            return False

        subscription.current_period_start = period_start
        subscription.current_period_end = period_end
        return True

    async def get_current_paid_subscription(
        self,
        *,
        user: User,
    ) -> UserSubscription | None:
        subscription = await self._fetch_current_paid_subscription(user=user)

        # Subscriptions created straight from a checkout session start with no
        # billing period, and only a webhook would fill it in. Backfill the
        # period on read so the renewal date is available even when webhooks
        # never ran -- narrowly, without touching status.
        if subscription is not None and subscription.current_period_end is None:
            if await self._backfill_subscription_period(subscription=subscription):
                await self._session.commit()

        return subscription

    async def schedule_subscription_cancellation(
        self,
        *,
        user: User,
        user_agent: str | None,
        ip_address: str | None,
        actor: User | None = None,
    ) -> tuple[User, UserSubscription]:
        subscription = await self._fetch_current_paid_subscription(user=user)
        if subscription is None:
            raise StripePlanUnavailableError(
                "Nu există un abonament activ care poate fi anulat."
            )
        if subscription.cancel_at_period_end:
            return await self._refreshed_user(user), subscription

        stripe = StripeClient(self._settings)
        updated_subscription = await stripe.update_subscription_cancellation(
            subscription_id=subscription.stripe_subscription_id,
            cancel_at_period_end=True,
        )
        await self._handle_subscription_event(updated_subscription)
        await self._session.flush()

        refreshed_subscription = await self._fetch_subscription_by_stripe_id(
            subscription.stripe_subscription_id
        )
        if refreshed_subscription is None:
            raise StripeRequestError("Abonamentul nu a putut fi sincronizat.")

        add_audit_log(
            self._session,
            action="stripe.subscription.cancel_at_period_end.enabled",
            actor=actor or user,
            resource_type="user_subscription",
            resource_id=str(refreshed_subscription.id),
            details={
                "stripe_subscription_id": refreshed_subscription.stripe_subscription_id,
                "current_period_end": (
                    refreshed_subscription.current_period_end.isoformat()
                    if refreshed_subscription.current_period_end is not None
                    else None
                ),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()
        return await self._refreshed_user(user), refreshed_subscription

    async def resume_subscription_renewal(
        self,
        *,
        user: User,
        user_agent: str | None,
        ip_address: str | None,
        actor: User | None = None,
    ) -> tuple[User, UserSubscription]:
        subscription = await self._fetch_current_paid_subscription(user=user)
        if subscription is None:
            raise StripePlanUnavailableError(
                "Nu există un abonament activ care poate fi reactivat."
            )
        if not subscription.cancel_at_period_end:
            return await self._refreshed_user(user), subscription

        stripe = StripeClient(self._settings)
        updated_subscription = await stripe.update_subscription_cancellation(
            subscription_id=subscription.stripe_subscription_id,
            cancel_at_period_end=False,
        )
        await self._handle_subscription_event(updated_subscription)
        await self._session.flush()

        refreshed_subscription = await self._fetch_subscription_by_stripe_id(
            subscription.stripe_subscription_id
        )
        if refreshed_subscription is None:
            raise StripeRequestError("Abonamentul nu a putut fi sincronizat.")

        add_audit_log(
            self._session,
            action="stripe.subscription.cancel_at_period_end.disabled",
            actor=actor or user,
            resource_type="user_subscription",
            resource_id=str(refreshed_subscription.id),
            details={
                "stripe_subscription_id": refreshed_subscription.stripe_subscription_id,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()
        return await self._refreshed_user(user), refreshed_subscription

    async def admin_resync_subscriptions(
        self,
        *,
        user: User,
        actor: User,
        user_agent: str | None,
        ip_address: str | None,
    ) -> tuple[User, int]:
        """Re-read every subscription from Stripe and apply it locally.

        This is the repair path for a payment that went through in Stripe
        while the webhook that should have applied the plan never landed.
        Stripe is the source of truth, so nothing here decides which plan a
        user should get - it only replays what Stripe already says. Nothing
        is written back to Stripe: this call creates, changes and cancels
        nothing there.
        """
        if not user.stripe_customer_id:
            raise StripePlanUnavailableError(
                "Utilizatorul nu are un cont de plata Stripe."
            )

        stripe = StripeClient(self._settings)
        subscriptions = await stripe.list_customer_subscriptions(
            customer_id=user.stripe_customer_id,
        )

        # Oldest first, so the newest subscription settles the final plan.
        for subscription in sorted(
            subscriptions,
            key=lambda item: _int_or_zero(item.get("created")),
        ):
            await self._handle_subscription_event(
                subscription,
                cancel_superseded=False,
            )

        await self._session.flush()
        await self._reconcile_plan_after_replay(user=user)
        await self._sync_latest_invoices_for_user(user=user)

        refreshed_user = await self._refreshed_user(user)
        add_audit_log(
            self._session,
            action="admin.subscription.resynced",
            actor=actor,
            resource_type="user",
            resource_id=str(user.id),
            details={
                "target_user_email": user.email,
                "stripe_customer_id": user.stripe_customer_id,
                "subscriptions_seen": len(subscriptions),
                "resulting_plan": (
                    refreshed_user.current_plan.slug
                    if refreshed_user.current_plan is not None
                    else None
                ),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()
        return await self._refreshed_user(user), len(subscriptions)

    async def admin_grant_manual_plan(
        self,
        *,
        user: User,
        actor: User,
        plan_slug: str,
        reason: str,
        user_agent: str | None,
        ip_address: str | None,
    ) -> tuple[User, ManualPlanGrant]:
        """Put a user on a plan by hand, with no Stripe subscription behind it.

        The grant writes ``current_plan_id`` so every existing entitlement
        check keeps reading a single field, and stays live until revoked. A
        real Stripe subscription still wins: a later subscription event
        overwrites the plan, which is what should happen when someone
        eventually pays.
        """
        plan = await self._session.scalar(
            select(SubscriptionPlan).where(SubscriptionPlan.slug == plan_slug)
        )
        if plan is None:
            raise StripePlanUnavailableError("Planul cerut nu exista.")

        existing = await self._fetch_active_manual_grant(user=user)
        if existing is not None:
            raise StripePlanUnavailableError(
                "Utilizatorul are deja un plan acordat manual. "
                "Revoca-l inainte de a acorda altul."
            )

        grant = ManualPlanGrant(
            user_id=user.id,
            plan_id=plan.id,
            granted_by_id=actor.id,
            reason=reason.strip(),
        )
        self._session.add(grant)

        previous_plan_id = user.current_plan_id
        user.current_plan_id = plan.id
        if previous_plan_id != plan.id:
            await self._reactivate_projects_for_plan(user=user, plan=plan)

        add_audit_log(
            self._session,
            action="admin.subscription.manual_plan.granted",
            actor=actor,
            resource_type="user",
            resource_id=str(user.id),
            details={
                "target_user_email": user.email,
                "plan_slug": plan.slug,
                "reason": reason.strip(),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()
        return await self._refreshed_user(user), grant

    async def admin_revoke_manual_plan(
        self,
        *,
        user: User,
        actor: User,
        reason: str | None,
        user_agent: str | None,
        ip_address: str | None,
    ) -> User:
        """Drop a hand-granted plan and fall back to what the user really has.

        If a paid Stripe subscription is active the user lands back on it;
        otherwise they land on the free plan.
        """
        grant = await self._fetch_active_manual_grant(user=user)
        if grant is None:
            raise StripePlanUnavailableError(
                "Utilizatorul nu are un plan acordat manual."
            )

        grant.revoked_at = datetime.now(UTC)
        grant.revoked_by_id = actor.id
        grant.revoke_reason = reason.strip() if reason else None

        paid_subscription = await self._fetch_current_paid_subscription(user=user)
        if paid_subscription is not None:
            fallback_plan_id: UUID | None = paid_subscription.plan_id
        else:
            free_plan = await self._session.scalar(
                select(SubscriptionPlan).where(SubscriptionPlan.slug == "start")
            )
            fallback_plan_id = free_plan.id if free_plan is not None else None

        user.current_plan_id = fallback_plan_id

        add_audit_log(
            self._session,
            action="admin.subscription.manual_plan.revoked",
            actor=actor,
            resource_type="user",
            resource_id=str(user.id),
            details={
                "target_user_email": user.email,
                "revoke_reason": grant.revoke_reason,
                "fell_back_to_subscription": paid_subscription is not None,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()
        return await self._refreshed_user(user)

    async def _reconcile_plan_after_replay(self, *, user: User) -> None:
        """Decide the plan once, after every subscription has been replayed.

        Per-event logic is written for live webhooks, where one payload is the
        whole news. Replaying a history of mostly-cancelled subscriptions runs
        that logic dozens of times, and a cancelled one processed last would
        drop the user to the free plan even though another subscription is
        still active. So the plan is settled here instead, from the final
        state: a live manual grant wins, then a paid subscription, then free.

        The grant comes first on purpose. An admin set it deliberately and with
        a recorded reason, so a diagnostic re-sync must not quietly undo it and
        leave a grant row that claims to be active while changing nothing. A
        real payment still overrides it the moment its webhook lands.
        """
        grant = await self._fetch_active_manual_grant(user=user)
        if grant is not None:
            user.current_plan_id = grant.plan_id
            return

        paid_subscription = await self._fetch_current_paid_subscription(user=user)
        if paid_subscription is not None:
            user.current_plan_id = paid_subscription.plan_id
            return

        free_plan = await self._session.scalar(
            select(SubscriptionPlan).where(SubscriptionPlan.slug == "start")
        )
        user.current_plan_id = free_plan.id if free_plan is not None else None

    async def _fetch_active_manual_grant(
        self,
        *,
        user: User,
    ) -> ManualPlanGrant | None:
        return await self._session.scalar(
            select(ManualPlanGrant)
            .options(
                selectinload(ManualPlanGrant.plan),
                selectinload(ManualPlanGrant.granted_by),
            )
            .where(
                ManualPlanGrant.user_id == user.id,
                ManualPlanGrant.revoked_at.is_(None),
            )
            .order_by(ManualPlanGrant.created_at.desc())
            .limit(1)
        )

    async def create_addon_checkout_session(
        self,
        *,
        user: User,
        items: dict[str, int],
        user_agent: str | None,
        ip_address: str | None,
    ) -> CheckoutSessionResult:
        """Start a one-off purchase of extra capacity.

        ``items`` maps a resource key to a quantity. Quantities are validated
        against the resource's own bounds here rather than trusted from the
        client, and the price comes from the resource row, so the caller can
        choose how much but never what it costs.

        Sold to paying subscribers only: on the free plan the answer to running
        out is the subscription itself, not an endless string of top-ups.
        """
        plan = getattr(user, "current_plan", None)
        plan_price = getattr(plan, "price_ron", None)
        if plan is None or plan_price is None or Decimal(str(plan_price)) <= 0:
            raise StripePlanUnavailableError(
                "Pachetele suplimentare sunt disponibile doar pe planurile platite."
            )

        wanted = {key: int(value) for key, value in items.items() if int(value) > 0}
        if not wanted:
            raise StripePlanUnavailableError("Alege cel putin o resursa.")

        resources = {
            resource.resource_key: resource
            for resource in (
                await self._session.scalars(
                    select(AddonResource).where(
                        AddonResource.resource_key.in_(list(wanted)),
                        AddonResource.is_visible.is_(True),
                    )
                )
            ).all()
        }

        line_items: list[tuple[str, int]] = []
        quantities: dict[str, int] = {}
        for key, quantity in wanted.items():
            resource = resources.get(key)
            if resource is None:
                raise StripePlanUnavailableError(f"Resursa {key} nu este disponibila.")
            if not resource.stripe_price_id:
                raise StripePlanUnavailableError(
                    f"{resource.name} nu este disponibila pentru cumparare."
                )
            if quantity < resource.min_quantity:
                raise StripePlanUnavailableError(
                    f"Minimul pentru {resource.name} este "
                    f"{resource.min_quantity} {resource.unit_label}."
                )
            if quantity > resource.max_quantity:
                raise StripePlanUnavailableError(
                    f"Maximul pentru {resource.name} este "
                    f"{resource.max_quantity} {resource.unit_label}."
                )
            if quantity % resource.step != 0:
                raise StripePlanUnavailableError(
                    f"{resource.name} se cumpara din {resource.step} in "
                    f"{resource.step} {resource.unit_label}."
                )

            column = resource.purchase_column
            if column is None:
                raise StripePlanUnavailableError(f"Resursa {key} nu este configurata.")

            line_items.append((resource.stripe_price_id, quantity))
            quantities[column] = quantity

        stripe = StripeClient(self._settings)
        customer_id = user.stripe_customer_id or await self._create_stripe_customer(
            stripe,
            user=user,
        )

        cycle_start, cycle_end = await billing_cycle_window(self._session, user)
        purchase = AddonPurchase(
            user_id=user.id,
            status=PURCHASE_PENDING,
            # Filled in below; the row exists first so the basket is recorded
            # even if the redirect never completes.
            stripe_checkout_session_id=f"pending:{uuid4()}",
            cycle_start=cycle_start,
            cycle_end=cycle_end,
            **quantities,
        )
        self._session.add(purchase)
        await self._session.flush()

        session_payload = await stripe.create_addon_checkout_session(
            user=user,
            purchase_id=purchase.id,
            line_items=line_items,
            customer_id=customer_id,
            success_url=self._addon_success_url(),
            cancel_url=self._addon_cancel_url(),
        )
        checkout_url = _string_or_none(session_payload.get("url"))
        session_id = _string_or_none(session_payload.get("id"))
        if not checkout_url or not session_id:
            raise StripeRequestError("Stripe nu a returnat o sesiune de plata.")

        purchase.stripe_checkout_session_id = session_id

        add_audit_log(
            self._session,
            action="stripe.addon.checkout_started",
            actor=user,
            resource_type="addon_purchase",
            resource_id=str(purchase.id),
            details={"items": quantities, "checkout_session_id": session_id},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()

        return CheckoutSessionResult(checkout_url=checkout_url, session_id=session_id)

    async def record_addon_purchase(
        self,
        *,
        session_payload: dict[str, Any],
    ) -> AddonPurchase | None:
        """Mark a pending order paid, at most once.

        Stripe retries webhooks and the browser syncs the same session on the
        way back, so this runs several times for one payment. Flipping an
        already-paid row is a no-op, which is what makes both paths safe.
        """
        session_id = _string_or_none(session_payload.get("id"))
        if not session_id:
            return None
        if str(session_payload.get("payment_status") or "") != "paid":
            return None

        purchase = await self._session.scalar(
            select(AddonPurchase).where(
                AddonPurchase.stripe_checkout_session_id == session_id
            )
        )
        if purchase is None:
            return None
        if purchase.status == PURCHASE_PAID:
            return purchase

        purchase.status = PURCHASE_PAID
        purchase.paid_at = datetime.now(UTC)
        purchase.stripe_payment_intent_id = _string_or_none(
            session_payload.get("payment_intent")
        )
        purchase.amount_paid = _int_or_zero(session_payload.get("amount_total"))
        purchase.currency = str(session_payload.get("currency") or "RON").upper()

        user = await self._session.get(User, purchase.user_id)
        add_audit_log(
            self._session,
            action="stripe.addon.purchased",
            actor=user,
            resource_type="addon_purchase",
            resource_id=str(purchase.id),
            details={
                "amount_paid": purchase.amount_paid,
                "currency": purchase.currency,
                "ai_credits": purchase.extra_ai_credits,
                "ocr_pages": purchase.extra_ocr_pages,
                "cycle_end": purchase.cycle_end.isoformat(),
            },
        )
        return purchase

    async def _sync_addon_invoice(
        self,
        *,
        session_payload: dict[str, Any],
        user: User,
    ) -> None:
        """Record and email the invoice for a one-off purchase.

        Subscriptions already have a polling fallback that fetches invoices
        from Stripe, which is why they arrive even when no webhook does. Packs
        had none, so on any setup where invoice.paid cannot reach the backend -
        local development being the obvious one - the customer was charged and
        got no document at all.

        The webhook stays authoritative; both paths are idempotent, and the
        invoice is skipped silently if Stripe has not finalised it yet.
        """
        invoice_id = _string_or_none(session_payload.get("invoice"))
        if invoice_id is None:
            return

        try:
            stripe = StripeClient(self._settings)
            invoice_payload = await stripe.retrieve_invoice(invoice_id=invoice_id)
        except (StripeConfigurationError, StripeRequestError) as exc:
            logger.warning(
                "Factura %s pentru pachet nu a putut fi citita: %s",
                invoice_id,
                exc,
            )
            return

        subscription_invoice = await self._upsert_invoice(invoice=invoice_payload)
        if subscription_invoice is None:
            return

        await self._send_paid_invoice_email_if_needed(
            invoice=subscription_invoice,
            user=user,
            line_items=_invoice_line_items(invoice_payload),
        )

    async def sync_addon_checkout_session(
        self,
        *,
        user: User,
        session_id: str,
    ) -> AddonPurchase | None:
        """Credit the order on return from Stripe, without waiting.

        The webhook stays authoritative, but it can land after the browser
        does. Both paths call the same idempotent recorder.
        """
        stripe = StripeClient(self._settings)
        session_payload = await stripe.retrieve_checkout_session(session_id=session_id)

        metadata = session_payload.get("metadata") or {}
        if _uuid_or_none(metadata.get("user_id")) != user.id:
            raise StripePlanUnavailableError("Sesiunea nu apartine acestui cont.")

        purchase = await self.record_addon_purchase(session_payload=session_payload)
        if purchase is not None:
            await self._sync_addon_invoice(
                session_payload=session_payload,
                user=user,
            )
        await self._session.commit()
        return purchase

    def _addon_success_url(self) -> str:
        # Stripe only fills the session id in where the placeholder appears, and
        # the account page needs it to credit the order without waiting for the
        # webhook.
        return (
            f"{self._settings.public_app_url}"
            "/myaccount?addon=success&session_id={CHECKOUT_SESSION_ID}"
        )

    def _addon_cancel_url(self) -> str:
        return f"{self._settings.public_app_url}/myaccount?addon=cancelled"

    async def _fetch_user_invoices(self, *, user: User) -> list[SubscriptionInvoice]:
        result = await self._session.scalars(
            select(SubscriptionInvoice)
            .where(SubscriptionInvoice.user_id == user.id)
            .order_by(SubscriptionInvoice.created_at.desc())
            .limit(50)
        )
        return list(result)

    async def _fetch_active_subscriptions(
        self,
        *,
        user: User,
    ) -> list[UserSubscription]:
        result = await self._session.scalars(
            select(UserSubscription)
            .where(
                UserSubscription.user_id == user.id,
                UserSubscription.status.in_(CHECKOUT_SUBSCRIPTION_STATUSES),
            )
            .order_by(UserSubscription.updated_at.desc())
        )
        return list(result)

    async def _fetch_current_paid_subscription(
        self,
        *,
        user: User,
    ) -> UserSubscription | None:
        return await self._session.scalar(
            select(UserSubscription)
            .join(SubscriptionPlan)
            .options(selectinload(UserSubscription.plan))
            .where(
                UserSubscription.user_id == user.id,
                UserSubscription.status.in_(CHECKOUT_SUBSCRIPTION_STATUSES),
                SubscriptionPlan.price_ron > 0,
            )
            .order_by(
                UserSubscription.updated_at.desc(),
                UserSubscription.created_at.desc(),
            )
            .limit(1)
        )

    async def _fetch_subscription_by_stripe_id(
        self,
        stripe_subscription_id: str,
    ) -> UserSubscription | None:
        return await self._session.scalar(
            select(UserSubscription)
            .options(selectinload(UserSubscription.plan))
            .where(
                UserSubscription.stripe_subscription_id == stripe_subscription_id
            )
        )

    async def _refreshed_user(self, user: User) -> User:
        refreshed_user = await self._session.scalar(
            select(User)
            .options(selectinload(User.current_plan))
            .where(User.id == user.id)
            .execution_options(populate_existing=True)
        )
        return refreshed_user or user

    async def _sync_latest_invoices_for_user(self, *, user: User) -> None:
        try:
            stripe = StripeClient(self._settings)
        except StripeConfigurationError:
            return

        result = await self._session.scalars(
            select(UserSubscription)
            .where(UserSubscription.user_id == user.id)
            .order_by(UserSubscription.updated_at.desc())
            .limit(5)
        )
        for subscription in result:
            await self._sync_latest_invoice_from_stripe(
                stripe=stripe,
                stripe_subscription_id=subscription.stripe_subscription_id,
            )

    async def _handle_checkout_completed(self, session: dict[str, Any]) -> None:
        # A pack purchase is mode=payment and carries no subscription, so it
        # has to branch out before the subscription path discards it.
        if str(session.get("mode") or "") == "payment":
            purchase = await self.record_addon_purchase(session_payload=session)
            if purchase is not None:
                user = await self._session.get(User, purchase.user_id)
                if user is not None:
                    await self._sync_addon_invoice(
                        session_payload=session,
                        user=user,
                    )
            return

        metadata = session.get("metadata") or {}
        user_id = metadata.get("user_id") or session.get("client_reference_id")
        plan_id = metadata.get("plan_id")
        stripe_customer_id = str(session.get("customer") or "")
        stripe_subscription_id = str(session.get("subscription") or "")
        if (
            not user_id
            or not plan_id
            or not stripe_customer_id
            or not stripe_subscription_id
        ):
            return

        parsed_user_id = _uuid_or_none(user_id)
        parsed_plan_id = _uuid_or_none(plan_id)
        if parsed_user_id is None or parsed_plan_id is None:
            return

        user = await self._session.get(User, parsed_user_id)
        plan = await self._session.get(SubscriptionPlan, parsed_plan_id)
        if user is None or plan is None or not plan.stripe_price_id:
            return

        user.stripe_customer_id = stripe_customer_id
        status = (
            "active"
            if session.get("payment_status") == "paid"
            else "checkout_completed"
        )
        await self._upsert_subscription(
            user=user,
            plan=plan,
            stripe_customer_id=stripe_customer_id,
            stripe_subscription_id=stripe_subscription_id,
            stripe_price_id=plan.stripe_price_id,
            status=status,
            current_period_start=None,
            current_period_end=None,
            cancel_at_period_end=False,
            canceled_at=None,
        )

    async def _handle_subscription_event(
        self,
        subscription: dict[str, Any],
        *,
        cancel_superseded: bool = True,
    ) -> None:
        """Apply one Stripe subscription payload to our records.

        ``cancel_superseded`` must be False when replaying history rather than
        reacting to a live event: superseding issues real DELETE calls to
        Stripe, which a read-only repair must never do.
        """
        stripe_subscription_id = str(subscription.get("id") or "")
        stripe_customer_id = str(subscription.get("customer") or "")
        status = str(subscription.get("status") or "unknown")
        price_id = self._subscription_price_id(subscription)
        if not stripe_subscription_id or not stripe_customer_id or not price_id:
            return

        plan = await self._session.scalar(
            select(SubscriptionPlan).where(SubscriptionPlan.stripe_price_id == price_id)
        )
        if plan is None:
            # Updating a plan's price in Stripe issues a new Price ID, while
            # existing subscriptions keep the old one. Without this every later
            # event for those subscribers (renewal, cancellation, deletion)
            # would be ignored and they would keep the plan forever.
            existing_subscription = await self._session.scalar(
                select(UserSubscription).where(
                    UserSubscription.stripe_subscription_id == stripe_subscription_id
                )
            )
            if existing_subscription is not None:
                plan = await self._session.get(
                    SubscriptionPlan, existing_subscription.plan_id
                )
        user = await self._session.scalar(
            select(User).where(User.stripe_customer_id == stripe_customer_id)
        )
        if user is None:
            metadata = subscription.get("metadata") or {}
            user_id = metadata.get("user_id")
            parsed_user_id = _uuid_or_none(user_id)
            if parsed_user_id is not None:
                user = await self._session.get(User, parsed_user_id)
        if user is None or plan is None:
            return

        period_start, period_end = self._subscription_period(subscription)
        user.stripe_customer_id = stripe_customer_id
        await self._upsert_subscription(
            user=user,
            plan=plan,
            stripe_customer_id=stripe_customer_id,
            stripe_subscription_id=stripe_subscription_id,
            stripe_price_id=price_id,
            status=status,
            current_period_start=period_start,
            current_period_end=period_end,
            cancel_at_period_end=bool(subscription.get("cancel_at_period_end")),
            canceled_at=_timestamp(subscription.get("canceled_at")),
            cancel_superseded=cancel_superseded,
        )

    async def _handle_invoice_payment_failed(self, invoice: dict[str, Any]) -> None:
        await self._mark_subscription_from_invoice(invoice, status="past_due")

    async def _handle_invoice_paid(
        self,
        invoice: dict[str, Any],
        *,
        send_email: bool,
    ) -> None:
        await self._mark_subscription_from_invoice(
            invoice,
            status="active",
            send_email=send_email,
        )

    async def _mark_subscription_from_invoice(
        self,
        invoice: dict[str, Any],
        *,
        status: str,
        send_email: bool = False,
    ) -> None:
        user_subscription = await self._find_subscription_from_invoice(invoice)
        subscription_invoice = await self._upsert_invoice(
            invoice=invoice,
            user_subscription=user_subscription,
        )
        if user_subscription is None:
            # A one-off purchase has no subscription, but it still produces an
            # invoice and the customer still expects the same email. The
            # subscription bookkeeping below simply does not apply to it.
            if send_email and subscription_invoice is not None:
                standalone_user = await self._session.get(
                    User,
                    subscription_invoice.user_id,
                )
                if standalone_user is not None:
                    await self._send_paid_invoice_email_if_needed(
                        invoice=subscription_invoice,
                        user=standalone_user,
                    )
            return
        stripe_subscription_id = user_subscription.stripe_subscription_id
        user_subscription = await self._session.scalar(
            select(UserSubscription).where(
                UserSubscription.stripe_subscription_id == stripe_subscription_id
            )
        )
        if user_subscription is None:
            return
        user_subscription.status = status
        user_subscription.updated_at = datetime.now(UTC)
        user = await self._session.get(User, user_subscription.user_id)
        if user is not None and status in ACTIVE_SUBSCRIPTION_STATUSES:
            latest_active_subscription = await self._latest_active_subscription(
                user=user,
            )
            if (
                latest_active_subscription is None
                or latest_active_subscription.id == user_subscription.id
            ):
                user.current_plan_id = user_subscription.plan_id
                await self._cancel_superseded_subscriptions(
                    user=user,
                    active_subscription=user_subscription,
                )
            if send_email and subscription_invoice is not None:
                await self._send_paid_invoice_email_if_needed(
                    invoice=subscription_invoice,
                    user=user,
                )

    async def _sync_latest_invoice_from_stripe(
        self,
        *,
        stripe: StripeClient,
        stripe_subscription_id: str,
        send_email_user: User | None = None,
    ) -> None:
        try:
            subscription = await stripe.retrieve_subscription(
                subscription_id=stripe_subscription_id,
            )
        except StripeRequestError:
            return

        latest_invoice = subscription.get("latest_invoice")
        if isinstance(latest_invoice, dict):
            subscription_invoice = await self._upsert_invoice(invoice=latest_invoice)
            if send_email_user is not None and subscription_invoice is not None:
                await self._send_paid_invoice_email_if_needed(
                    invoice=subscription_invoice,
                    user=send_email_user,
                )
            return

        if isinstance(latest_invoice, str) and latest_invoice.startswith("in_"):
            try:
                invoice = await stripe.retrieve_invoice(invoice_id=latest_invoice)
            except StripeRequestError:
                return
            subscription_invoice = await self._upsert_invoice(invoice=invoice)
            if send_email_user is not None and subscription_invoice is not None:
                await self._send_paid_invoice_email_if_needed(
                    invoice=subscription_invoice,
                    user=send_email_user,
                )

    async def _find_subscription_from_invoice(
        self,
        invoice: dict[str, Any],
    ) -> UserSubscription | None:
        stripe_subscription_id = self._invoice_subscription_id(invoice)
        if stripe_subscription_id is None:
            return None

        return await self._session.scalar(
            select(UserSubscription).where(
                UserSubscription.stripe_subscription_id == stripe_subscription_id
            )
        )

    async def _upsert_invoice(
        self,
        *,
        invoice: dict[str, Any],
        user_subscription: UserSubscription | None = None,
    ) -> SubscriptionInvoice | None:
        stripe_invoice_id = _string_or_none(invoice.get("id"))
        stripe_customer_id = _string_or_none(invoice.get("customer"))
        if stripe_invoice_id is None or stripe_customer_id is None:
            return None

        if user_subscription is None:
            user_subscription = await self._find_subscription_from_invoice(invoice)

        user: User | None = None
        plan_id: UUID | None = None
        user_subscription_id: UUID | None = None
        if user_subscription is not None:
            user = await self._session.get(User, user_subscription.user_id)
            plan_id = user_subscription.plan_id
            user_subscription_id = user_subscription.id

        if user is None:
            user = await self._session.scalar(
                select(User).where(User.stripe_customer_id == stripe_customer_id)
            )
            # plan_id is deliberately left unset here. An invoice with no
            # subscription behind it is a one-off purchase, and stamping the
            # customer's current plan on it would make a top-up receipt read as
            # if it were a subscription charge.

        if user is None:
            return None

        subscription_invoice = await self._session.scalar(
            select(SubscriptionInvoice).where(
                SubscriptionInvoice.stripe_invoice_id == stripe_invoice_id
            )
        )
        if subscription_invoice is None:
            subscription_invoice = SubscriptionInvoice(
                user_id=user.id,
                stripe_invoice_id=stripe_invoice_id,
                stripe_customer_id=stripe_customer_id,
                status=str(invoice.get("status") or "unknown"),
                created_at=datetime.now(UTC),
            )
            self._session.add(subscription_invoice)

        status_transitions = invoice.get("status_transitions") or {}
        subscription_invoice.user_id = user.id
        subscription_invoice.plan_id = plan_id
        subscription_invoice.user_subscription_id = user_subscription_id
        subscription_invoice.stripe_customer_id = stripe_customer_id
        subscription_invoice.stripe_subscription_id = self._invoice_subscription_id(
            invoice
        )
        subscription_invoice.hosted_invoice_url = _string_or_none(
            invoice.get("hosted_invoice_url")
        )
        subscription_invoice.invoice_pdf_url = _string_or_none(
            invoice.get("invoice_pdf")
        )
        subscription_invoice.number = _string_or_none(invoice.get("number"))
        subscription_invoice.status = str(invoice.get("status") or "unknown")
        subscription_invoice.currency = str(invoice.get("currency") or "ron").upper()
        subscription_invoice.amount_due = _int_or_zero(invoice.get("amount_due"))
        subscription_invoice.amount_paid = _int_or_zero(invoice.get("amount_paid"))
        subscription_invoice.period_start = _timestamp(invoice.get("period_start"))
        subscription_invoice.period_end = _timestamp(invoice.get("period_end"))
        subscription_invoice.paid_at = _timestamp(status_transitions.get("paid_at"))
        subscription_invoice.updated_at = datetime.now(UTC)
        return subscription_invoice

    async def _send_paid_invoice_email_if_needed(
        self,
        *,
        invoice: SubscriptionInvoice,
        user: User,
        line_items: list[tuple[str, str]] | None = None,
    ) -> None:
        """Email a paid invoice, once.

        ``line_items`` marks this as a one-off purchase and switches the
        template: a top-up receipt has to list what was bought, since there is
        no plan name that would describe it.
        """
        if invoice.email_sent_at is not None or invoice.status != "paid":
            return

        invoice_url = invoice.hosted_invoice_url or invoice.invoice_pdf_url
        if invoice_url is None:
            invoice.email_delivery_error = (
                "Factura Stripe nu are hosted_invoice_url sau invoice_pdf."
            )
            return

        # Sent from a webhook too, where no request language exists: the
        # account preference is the only signal.
        language = normalize_language(user.language_preference)
        logo_html = email_logo_html(
            self._settings.email_logo_url,
            app_name="Reviss",
        )

        if line_items:
            html, text = addon_invoice_paid_email(
                invoice_url=invoice_url,
                invoice_pdf_url=invoice.invoice_pdf_url,
                invoice_number=invoice.number,
                amount_label=_format_invoice_amount(invoice),
                paid_at_label=_format_invoice_paid_at(invoice),
                line_items=line_items,
                logo_html=logo_html,
                app_name="Reviss",
                language=language,
            )
        else:
            plan_name: str | None = None
            if invoice.plan_id is not None:
                plan = await self._session.get(SubscriptionPlan, invoice.plan_id)
                plan_name = plan.name if plan is not None else None

            html, text = invoice_paid_email(
                invoice_url=invoice_url,
                invoice_pdf_url=invoice.invoice_pdf_url,
                invoice_number=invoice.number,
                amount_label=_format_invoice_amount(invoice),
                paid_at_label=_format_invoice_paid_at(invoice),
                plan_name=plan_name,
                logo_html=logo_html,
                app_name="Reviss",
                language=language,
            )

        try:
            await self._email.send(
                EmailMessage(
                    to=user.email,
                    subject=t(
                        "email.invoice_paid.subject",
                        language,
                        number=invoice.number or invoice.stripe_invoice_id,
                    ),
                    html=html,
                    text=text,
                )
            )
        except EmailDeliveryError as exc:
            invoice.email_delivery_error = _trim_delivery_error(exc)
            add_audit_log(
                self._session,
                action="stripe.invoice_email.failed",
                status="failed",
                actor=user,
                resource_type="subscription_invoice",
                resource_id=str(invoice.id),
                details={
                    "stripe_invoice_id": invoice.stripe_invoice_id,
                    "error": invoice.email_delivery_error,
                },
            )
            return

        invoice.email_sent_at = datetime.now(UTC)
        invoice.email_delivery_error = None
        add_audit_log(
            self._session,
            action="stripe.invoice_email.sent",
            actor=user,
            resource_type="subscription_invoice",
            resource_id=str(invoice.id),
            details={
                "stripe_invoice_id": invoice.stripe_invoice_id,
                "invoice_number": invoice.number,
            },
        )

    async def _upsert_subscription(
        self,
        *,
        user: User,
        plan: SubscriptionPlan,
        stripe_customer_id: str,
        stripe_subscription_id: str,
        stripe_price_id: str,
        status: str,
        current_period_start: datetime | None,
        current_period_end: datetime | None,
        cancel_at_period_end: bool,
        canceled_at: datetime | None,
        cancel_superseded: bool = True,
    ) -> None:
        now = datetime.now(UTC)
        user_subscription = await self._session.scalar(
            select(UserSubscription).where(
                UserSubscription.stripe_subscription_id == stripe_subscription_id
            )
        )
        if user_subscription is None:
            user_subscription = UserSubscription(
                user_id=user.id,
                plan_id=plan.id,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_subscription_id,
                stripe_price_id=stripe_price_id,
                status=status,
                created_at=now,
            )
            self._session.add(user_subscription)

        user_subscription.user_id = user.id
        user_subscription.plan_id = plan.id
        user_subscription.stripe_customer_id = stripe_customer_id
        user_subscription.stripe_subscription_id = stripe_subscription_id
        user_subscription.stripe_price_id = stripe_price_id
        user_subscription.status = status
        # Payloads without billing periods (checkout sessions, out-of-order
        # webhooks) must not wipe periods already synced from Stripe.
        if current_period_start is not None:
            user_subscription.current_period_start = current_period_start
        if current_period_end is not None:
            user_subscription.current_period_end = current_period_end
        user_subscription.cancel_at_period_end = cancel_at_period_end
        user_subscription.canceled_at = canceled_at
        user_subscription.updated_at = now

        if status in ACTIVE_SUBSCRIPTION_STATUSES:
            latest_active_subscription = await self._latest_active_subscription(
                user=user,
            )
            if (
                latest_active_subscription is None
                or latest_active_subscription.id == user_subscription.id
            ):
                previous_plan_id = user.current_plan_id
                user.current_plan_id = plan.id
                if previous_plan_id != plan.id:
                    await self._reactivate_projects_for_plan(user=user, plan=plan)
                if cancel_superseded:
                    await self._cancel_superseded_subscriptions(
                        user=user,
                        active_subscription=user_subscription,
                    )
        elif (
            status in INACTIVE_SUBSCRIPTION_STATUSES
            and user.current_plan_id == plan.id
        ):
            free_plan = await self._session.scalar(
                select(SubscriptionPlan).where(SubscriptionPlan.slug == "start")
            )
            user.current_plan_id = free_plan.id if free_plan is not None else None

    async def _latest_active_subscription(
        self,
        *,
        user: User,
    ) -> UserSubscription | None:
        return await self._session.scalar(
            select(UserSubscription)
            .where(
                UserSubscription.user_id == user.id,
                UserSubscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
            )
            .order_by(
                UserSubscription.created_at.desc(),
                UserSubscription.updated_at.desc(),
            )
            .limit(1)
        )

    async def _reactivate_projects_for_plan(
        self,
        *,
        user: User,
        plan: SubscriptionPlan,
    ) -> None:
        """Give deactivated projects their slots back after a plan change.

        Paying again should restore access immediately -- otherwise the user
        buys the upgrade and still has to re-activate everything by hand. Only
        fills the slots the new plan actually has, newest first; a downgrade
        simply finds no room and changes nothing.
        """
        slots = max(int(plan.active_project_slots or 0), 0)

        active_count = await self._session.scalar(
            select(func.count(StudyProject.id)).where(
                StudyProject.user_id == user.id,
                StudyProject.status.in_(SLOT_OCCUPYING_STATUSES),
                StudyProject.deactivated_at.is_(None),
                ~StudyProject.archive.has(),
            )
        )
        free_slots = slots - int(active_count or 0)
        if free_slots <= 0:
            return

        candidates = list(
            (
                await self._session.scalars(
                    select(StudyProject)
                    .where(
                        StudyProject.user_id == user.id,
                        StudyProject.status.in_(SLOT_OCCUPYING_STATUSES),
                        StudyProject.deactivated_at.is_not(None),
                        ~StudyProject.archive.has(),
                    )
                    .order_by(StudyProject.updated_at.desc())
                    .limit(free_slots)
                )
            ).all()
        )
        for project in candidates:
            project.deactivated_at = None

    async def _cancel_superseded_subscriptions(
        self,
        *,
        user: User,
        active_subscription: UserSubscription,
    ) -> None:
        result = await self._session.scalars(
            select(UserSubscription).where(
                UserSubscription.user_id == user.id,
                UserSubscription.id != active_subscription.id,
                UserSubscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
            )
        )
        superseded_subscriptions = list(result)
        if not superseded_subscriptions:
            return

        try:
            stripe = StripeClient(self._settings)
        except StripeConfigurationError as exc:
            for subscription in superseded_subscriptions:
                add_audit_log(
                    self._session,
                    action="stripe.subscription.superseded_cancel_failed",
                    status="failed",
                    actor=user,
                    resource_type="user_subscription",
                    resource_id=str(subscription.id),
                    details={
                        "active_subscription_id": str(active_subscription.id),
                        "stripe_subscription_id": subscription.stripe_subscription_id,
                        "error": _trim_delivery_error(exc),
                    },
                )
            return

        now = datetime.now(UTC)
        for subscription in superseded_subscriptions:
            try:
                await stripe.cancel_subscription(
                    subscription_id=subscription.stripe_subscription_id,
                )
            except StripeRequestError as exc:
                add_audit_log(
                    self._session,
                    action="stripe.subscription.superseded_cancel_failed",
                    status="failed",
                    actor=user,
                    resource_type="user_subscription",
                    resource_id=str(subscription.id),
                    details={
                        "active_subscription_id": str(active_subscription.id),
                        "stripe_subscription_id": subscription.stripe_subscription_id,
                        "error": _trim_delivery_error(exc),
                    },
                )
                continue

            subscription.status = "canceled"
            subscription.cancel_at_period_end = False
            subscription.canceled_at = now
            subscription.updated_at = now
            add_audit_log(
                self._session,
                action="stripe.subscription.superseded_cancelled",
                actor=user,
                resource_type="user_subscription",
                resource_id=str(subscription.id),
                details={
                    "active_subscription_id": str(active_subscription.id),
                    "stripe_subscription_id": subscription.stripe_subscription_id,
                },
            )

    def _verify_event(
        self,
        payload: bytes,
        signature_header: str | None,
    ) -> dict[str, Any]:
        if self._settings.stripe_webhook_secret is None:
            raise StripeConfigurationError("STRIPE_WEBHOOK_SECRET nu este configurat.")
        if not signature_header:
            raise StripeSignatureError("Lipseste Stripe-Signature.")

        timestamp_value: str | None = None
        signatures: list[str] = []
        for item in signature_header.split(","):
            key, _, value = item.partition("=")
            if key == "t":
                timestamp_value = value
            elif key == "v1":
                signatures.append(value)

        if not timestamp_value or not signatures:
            raise StripeSignatureError("Semnatura Stripe este invalida.")

        try:
            timestamp = int(timestamp_value)
        except ValueError as exc:
            raise StripeSignatureError("Timestamp Stripe invalid.") from exc
        if abs(int(time.time()) - timestamp) > 300:
            raise StripeSignatureError("Semnatura Stripe a expirat.")

        signed_payload = f"{timestamp_value}.".encode() + payload
        expected_signature = hmac.new(
            self._settings.stripe_webhook_secret.get_secret_value().encode("utf-8"),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()
        if not any(
            hmac.compare_digest(expected_signature, signature)
            for signature in signatures
        ):
            raise StripeSignatureError("Semnatura Stripe nu corespunde.")

        try:
            return json.loads(payload.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise StripeSignatureError("Payload Stripe invalid.") from exc

    def _subscription_price_id(self, subscription: dict[str, Any]) -> str | None:
        items = subscription.get("items", {}).get("data", [])
        if not items:
            return None
        price = items[0].get("price") or {}
        price_id = price.get("id")
        return str(price_id) if price_id else None

    def _subscription_period(
        self,
        subscription: dict[str, Any],
    ) -> tuple[datetime | None, datetime | None]:
        # Stripe API 2025-03-31.basil moved current_period_start/end off the
        # subscription and onto its items; older versions keep them top-level.
        items = subscription.get("items", {}).get("data", [])
        if items:
            item = items[0]
            period_start = _timestamp(item.get("current_period_start"))
            period_end = _timestamp(item.get("current_period_end"))
            if period_start is not None or period_end is not None:
                return period_start, period_end

        return (
            _timestamp(subscription.get("current_period_start")),
            _timestamp(subscription.get("current_period_end")),
        )

    def _invoice_subscription_id(self, invoice: dict[str, Any]) -> str | None:
        direct_subscription = _string_or_none(invoice.get("subscription"))
        if direct_subscription is not None:
            return direct_subscription

        parent = invoice.get("parent")
        if not isinstance(parent, dict):
            return None

        subscription_details = parent.get("subscription_details")
        if not isinstance(subscription_details, dict):
            return None

        return _string_or_none(subscription_details.get("subscription"))

    def _success_url(self) -> str:
        return (
            f"{self._settings.public_app_url}"
            f"{self._settings.stripe_checkout_success_path}"
        )

    def _cancel_url(self) -> str:
        return (
            f"{self._settings.public_app_url}"
            f"{self._settings.stripe_checkout_cancel_path}"
        )

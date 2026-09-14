"""Buying capacity by the unit: quantities chosen, price left to Stripe."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.models import PURCHASE_PAID, PURCHASE_PENDING
from app.services import stripe_payments as stripe_module
from app.services.stripe_payments import (
    StripePaymentService,
    StripePlanUnavailableError,
)

CYCLE = (
    datetime(2026, 9, 1, tzinfo=UTC),
    datetime(2026, 10, 1, tzinfo=UTC),
)


class _FakeSession:
    def __init__(self, *, resources=(), purchase=None, user=None) -> None:
        self.added: list[object] = []
        self.commits = 0
        self.flushes = 0
        self._resources = list(resources)
        self._purchase = purchase
        self._user = user

    def add(self, entity: object) -> None:
        self.added.append(entity)

    async def scalars(self, _statement):
        return SimpleNamespace(all=lambda: list(self._resources))

    async def scalar(self, _statement):
        return self._purchase

    async def get(self, _model, _key):
        return self._user

    async def flush(self) -> None:
        self.flushes += 1

    async def commit(self) -> None:
        self.commits += 1


def _service(session) -> StripePaymentService:
    service = StripePaymentService.__new__(StripePaymentService)
    service._session = session
    service._settings = SimpleNamespace(public_app_url="https://www.reviss.app")
    return service


def _resource(**overrides) -> SimpleNamespace:
    resource = SimpleNamespace(
        id=uuid.uuid4(),
        resource_key="ai_credits",
        name="Credite AI",
        unit_label="credite",
        stripe_price_id="price_ai_credit",
        min_quantity=10,
        max_quantity=500,
        step=10,
        is_visible=True,
        purchase_column="extra_ai_credits",
    )
    for key, value in overrides.items():
        setattr(resource, key, value)
    return resource


def _user(price: str = "79.00") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="student@example.com",
        full_name="Student Exemplu",
        stripe_customer_id="cus_1",
        # A real User always carries one: the column is not nullable and the
        # checkout page is shown in this language.
        language_preference="ro",
        current_plan=SimpleNamespace(slug="focus", price_ron=Decimal(price)),
    )


def _patch_window(monkeypatch, window=CYCLE) -> None:
    async def _window(_session, _user):
        return window

    monkeypatch.setattr(stripe_module, "billing_cycle_window", _window)


def _patch_stripe(monkeypatch, captured: dict) -> None:
    class _FakeStripe:
        def __init__(self, _settings) -> None:
            pass

        async def create_addon_checkout_session(self, **kwargs):
            captured.update(kwargs)
            return {"id": "cs_1", "url": "https://checkout.stripe.com/cs_1"}

    monkeypatch.setattr(stripe_module, "StripeClient", _FakeStripe)


def _buy(service, user, items):
    return asyncio.run(
        service.create_addon_checkout_session(
            user=user,
            items=items,
            user_agent=None,
            ip_address=None,
        )
    )


# --- who may buy ------------------------------------------------------------


def test_the_free_plan_cannot_buy_capacity() -> None:
    """Running out on the free plan is answered by subscribing, not topping up."""
    session = _FakeSession(resources=[_resource()])
    service = _service(session)

    with pytest.raises(StripePlanUnavailableError):
        _buy(service, _user(price="0.00"), {"ai_credits": 30})

    assert session.commits == 0


def test_a_resource_without_a_stripe_price_is_not_sold() -> None:
    session = _FakeSession(resources=[_resource(stripe_price_id=None)])
    service = _service(session)

    with pytest.raises(StripePlanUnavailableError):
        _buy(service, _user(), {"ai_credits": 30})


# --- quantity bounds --------------------------------------------------------


def test_below_the_minimum_is_refused() -> None:
    """Stripe rejects charges under a per-currency floor.

    A unit priced in small change has to be sold in a batch big enough to
    clear it, or checkout fails at the provider with a confusing error.
    """
    session = _FakeSession(resources=[_resource(min_quantity=10)])
    service = _service(session)

    with pytest.raises(StripePlanUnavailableError):
        _buy(service, _user(), {"ai_credits": 5})


def test_above_the_maximum_is_refused() -> None:
    """Without a ceiling, topping up forever beats upgrading the plan."""
    session = _FakeSession(resources=[_resource(max_quantity=500)])
    service = _service(session)

    with pytest.raises(StripePlanUnavailableError):
        _buy(service, _user(), {"ai_credits": 600})


def test_a_quantity_off_the_step_is_refused() -> None:
    session = _FakeSession(resources=[_resource(step=10)])
    service = _service(session)

    with pytest.raises(StripePlanUnavailableError):
        _buy(service, _user(), {"ai_credits": 35})


def test_an_unknown_resource_is_refused() -> None:
    session = _FakeSession(resources=[])
    service = _service(session)

    with pytest.raises(StripePlanUnavailableError):
        _buy(service, _user(), {"ai_credits": 30})


# --- the checkout itself ----------------------------------------------------


def test_quantity_goes_to_stripe_rather_than_a_price_we_computed(
    monkeypatch,
) -> None:
    """Stripe multiplies unit price by quantity; we never send an amount."""
    session = _FakeSession(resources=[_resource()], user=_user())
    service = _service(session)
    captured: dict = {}
    _patch_stripe(monkeypatch, captured)
    _patch_window(monkeypatch)

    result = _buy(service, _user(), {"ai_credits": 30})

    assert result.checkout_url.endswith("cs_1")
    assert captured["line_items"] == [("price_ai_credit", 30)]
    assert "{CHECKOUT_SESSION_ID}" in captured["success_url"]
    assert "/myaccount" in captured["cancel_url"]


def test_a_basket_becomes_one_line_item_per_resource(monkeypatch) -> None:
    credits = _resource()
    pages = _resource(
        resource_key="pages",
        name="Pagini",
        unit_label="pagini",
        stripe_price_id="price_pages",
        min_quantity=100,
        max_quantity=5000,
        step=100,
        purchase_column="extra_pages",
    )
    session = _FakeSession(resources=[credits, pages], user=_user())
    service = _service(session)
    captured: dict = {}
    _patch_stripe(monkeypatch, captured)
    _patch_window(monkeypatch)

    _buy(service, _user(), {"ai_credits": 30, "pages": 200})

    assert sorted(captured["line_items"]) == [
        ("price_ai_credit", 30),
        ("price_pages", 200),
    ]


def test_the_order_is_written_before_the_redirect(monkeypatch) -> None:
    """The basket lives on our row, so Stripe metadata limits cannot truncate it.

    It starts pending, which also leaves abandoned checkouts visible.
    """
    session = _FakeSession(resources=[_resource()], user=_user())
    service = _service(session)
    captured: dict = {}
    _patch_stripe(monkeypatch, captured)
    _patch_window(monkeypatch)

    _buy(service, _user(), {"ai_credits": 30})

    orders = [item for item in session.added if hasattr(item, "extra_ai_credits")]
    assert len(orders) == 1
    order = orders[0]
    assert order.status == PURCHASE_PENDING
    assert order.extra_ai_credits == 30
    assert (order.cycle_start, order.cycle_end) == CYCLE
    assert captured["purchase_id"] == order.id
    # Only the id travels to Stripe, never the basket itself.
    assert order.stripe_checkout_session_id == "cs_1"


# --- crediting --------------------------------------------------------------


def _pending_order(**overrides) -> SimpleNamespace:
    order = SimpleNamespace(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        status=PURCHASE_PENDING,
        stripe_checkout_session_id="cs_1",
        stripe_payment_intent_id=None,
        amount_paid=0,
        currency="RON",
        extra_ai_credits=30,
        extra_ocr_pages=0,
        paid_at=None,
        cycle_end=CYCLE[1],
    )
    for key, value in overrides.items():
        setattr(order, key, value)
    return order


def _paid_session(session_id: str = "cs_1") -> dict:
    return {
        "id": session_id,
        "mode": "payment",
        "payment_status": "paid",
        "amount_total": 3900,
        "currency": "ron",
        "payment_intent": "pi_1",
    }


def test_a_paid_session_flips_the_order() -> None:
    order = _pending_order()
    session = _FakeSession(purchase=order, user=_user())
    service = _service(session)

    result = asyncio.run(
        service.record_addon_purchase(session_payload=_paid_session())
    )

    assert result is order
    assert order.status == PURCHASE_PAID
    assert order.amount_paid == 3900
    assert order.currency == "RON"
    assert order.paid_at is not None


def test_an_unpaid_session_credits_nothing() -> None:
    order = _pending_order()
    session = _FakeSession(purchase=order, user=_user())
    service = _service(session)

    payload = _paid_session() | {"payment_status": "unpaid"}

    assert asyncio.run(service.record_addon_purchase(session_payload=payload)) is None
    assert order.status == PURCHASE_PENDING


def test_an_already_paid_order_is_left_alone() -> None:
    """Stripe retries webhooks, and the browser syncs the same session too."""
    order = _pending_order(status=PURCHASE_PAID, amount_paid=3900)
    session = _FakeSession(purchase=order, user=_user())
    service = _service(session)

    result = asyncio.run(
        service.record_addon_purchase(
            session_payload=_paid_session() | {"amount_total": 999999}
        )
    )

    assert result is order
    # A replayed webhook must not overwrite what was actually charged.
    assert order.amount_paid == 3900


def test_a_session_with_no_order_credits_nothing() -> None:
    session = _FakeSession(purchase=None, user=_user())
    service = _service(session)

    assert (
        asyncio.run(service.record_addon_purchase(session_payload=_paid_session()))
        is None
    )


def test_a_subscription_session_is_not_mistaken_for_an_order() -> None:
    session = _FakeSession()
    service = _service(session)
    seen: list[str] = []

    async def _record(*, session_payload):  # noqa: ARG001
        seen.append("addon")

    service.record_addon_purchase = _record

    asyncio.run(
        service._handle_checkout_completed(
            {"id": "cs_2", "mode": "subscription", "metadata": {}}
        )
    )

    assert seen == []


def test_a_payment_session_routes_to_the_order_recorder() -> None:
    session = _FakeSession()
    service = _service(session)
    seen: list[str] = []

    async def _record(*, session_payload):
        seen.append(session_payload["id"])

    service.record_addon_purchase = _record

    asyncio.run(service._handle_checkout_completed({"id": "cs_3", "mode": "payment"}))

    assert seen == ["cs_3"]


# --- expiry -----------------------------------------------------------------


def test_an_order_is_bound_to_the_cycle_it_was_placed_in(monkeypatch) -> None:
    """Capacity expires with the cycle, so the bounds travel with the row."""
    session = _FakeSession(resources=[_resource()], user=_user())
    service = _service(session)
    next_cycle = (CYCLE[0] + timedelta(days=30), CYCLE[1] + timedelta(days=30))
    _patch_stripe(monkeypatch, {})
    _patch_window(monkeypatch, next_cycle)

    _buy(service, _user(), {"ai_credits": 30})

    order = next(item for item in session.added if hasattr(item, "extra_ai_credits"))
    assert (order.cycle_start, order.cycle_end) == next_cycle

# --- invoicing --------------------------------------------------------------


def test_checkout_asks_stripe_to_raise_an_invoice() -> None:
    """A payment-mode session issues no invoice unless it is asked to.

    Without this the customer gets a receipt but no document, while every
    subscription charge produces a proper invoice.
    """
    from app.services.stripe_payments import StripeClient

    client = StripeClient.__new__(StripeClient)
    captured: dict = {}

    def _request(method, path, data=None):  # noqa: ARG001
        captured.update(data or {})
        return {"id": "cs_1", "url": "https://checkout.stripe.com/cs_1"}

    client._request = _request

    asyncio.run(
        client.create_addon_checkout_session(
            user=_user(),
            purchase_id=uuid.uuid4(),
            line_items=[("price_ai_credit", 30)],
            customer_id="cus_1",
            success_url="https://www.reviss.app/myaccount",
            cancel_url="https://www.reviss.app/myaccount",
        )
    )

    assert captured["invoice_creation[enabled]"] == "true"
    assert captured["mode"] == "payment"


def test_a_paid_invoice_without_a_subscription_is_still_emailed() -> None:
    """A one-off purchase gets the same email as a subscription charge.

    The subscription bookkeeping does not apply to it, but the customer still
    paid and still expects the invoice in their inbox.
    """
    session = _FakeSession(user=_user())
    service = _service(session)

    fake_invoice = SimpleNamespace(user_id=uuid.uuid4(), status="paid")
    emailed: list[object] = []

    async def _find_subscription(_invoice):
        return None

    async def _upsert(**_kwargs):
        return fake_invoice

    async def _send(*, invoice, user):  # noqa: ARG001
        emailed.append(invoice)

    service._find_subscription_from_invoice = _find_subscription
    service._upsert_invoice = _upsert
    service._send_paid_invoice_email_if_needed = _send

    asyncio.run(
        service._mark_subscription_from_invoice(
            {"id": "in_1"},
            status="active",
            send_email=True,
        )
    )

    assert emailed == [fake_invoice]


def test_an_invoice_without_email_requested_is_not_emailed() -> None:
    session = _FakeSession(user=_user())
    service = _service(session)
    emailed: list[object] = []

    async def _find_subscription(_invoice):
        return None

    async def _upsert(**_kwargs):
        return SimpleNamespace(user_id=uuid.uuid4(), status="paid")

    async def _send(*, invoice, user):  # noqa: ARG001
        emailed.append(invoice)

    service._find_subscription_from_invoice = _find_subscription
    service._upsert_invoice = _upsert
    service._send_paid_invoice_email_if_needed = _send

    asyncio.run(
        service._mark_subscription_from_invoice(
            {"id": "in_2"},
            status="active",
            send_email=False,
        )
    )

    assert emailed == []


import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import (
    AppSettings,
    CurrentAdminUser,
    CurrentUser,
    DbSession,
)
from app.api.security import protect_state_changing_request
from app.core.rate_limit import consume_rate_limit
from app.models import PURCHASE_PAID, AddonPurchase, AddonResource
from app.schemas.addons import (
    AddonBalanceResponse,
    AddonCheckoutRequest,
    AddonCheckoutResponse,
    AddonCheckoutSyncRequest,
    AddonOfferResponse,
    AddonPurchaseResponse,
    AddonResourceResponse,
    AdminAddonResourceResponse,
    AdminAddonResourcesUpdate,
)
from app.services.addons import balance_of, billing_cycle_window
from app.services.audit import add_audit_log
from app.services.stripe_payments import (
    StripeConfigurationError,
    StripePaymentService,
    StripePlanUnavailableError,
    StripeRequestError,
)

# One minute, matching the payments router these endpoints sit beside.
ADDONS_RATE_LIMIT_WINDOW_SECONDS = 60
ADDONS_RATE_LIMIT_POLICIES = {
    # Each call creates a Stripe session and an order row, so this is the one
    # worth keeping tight.
    "checkout-session": 6,
    # Retried by the browser on return, and harmless when repeated.
    "checkout-session-sync": 20,
}

router = APIRouter(
    prefix="/api/addons",
    tags=["addons"],
    # These endpoints spend money and run on a cookie session, so a
    # cross-site POST must not be able to start a checkout. Same guard the
    # payments router uses.
    dependencies=[Depends(protect_state_changing_request)],
)


async def _enforce_addons_rate_limit(current_user: CurrentUser, action: str) -> None:
    await consume_rate_limit(
        bucket_key=f"addons:{current_user.id}:{action}",
        max_requests=ADDONS_RATE_LIMIT_POLICIES[action],
        window_seconds=ADDONS_RATE_LIMIT_WINDOW_SECONDS,
        error_message=(
            "Prea multe solicitari de plata. Incearca din nou peste putin timp."
        ),
    )


def _client_context(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    if user_agent is not None:
        user_agent = user_agent[:512]
    ip_address = request.client.host if request.client is not None else None
    return user_agent, ip_address


def _stripe_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, StripeConfigurationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe nu este configurat complet.",
        )
    if isinstance(exc, StripePlanUnavailableError):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Stripe nu a putut fi contactat.",
    )


def _is_on_paid_plan(user: CurrentUser) -> bool:
    plan = getattr(user, "current_plan", None)
    price = getattr(plan, "price_ron", None)
    if plan is None or price is None:
        return False
    try:
        return Decimal(str(price)) > 0
    except (TypeError, ValueError, ArithmeticError):
        return False


@router.get("", response_model=AddonOfferResponse)
async def get_addon_offer(
    current_user: CurrentUser,
    session: DbSession,
) -> AddonOfferResponse:
    """What can be bought, and what this account already has this cycle."""
    resources = list(
        (
            await session.scalars(
                select(AddonResource)
                .where(AddonResource.is_visible.is_(True))
                .order_by(AddonResource.sort_order, AddonResource.created_at)
            )
        ).all()
    )

    balance = balance_of(current_user)
    cycle_end = None
    if not balance.is_empty:
        _, cycle_end = await billing_cycle_window(session, current_user)

    return AddonOfferResponse(
        resources=[
            AddonResourceResponse.model_validate(resource) for resource in resources
        ],
        balance=AddonBalanceResponse(
            projects=balance.projects,
            materials=balance.materials,
            pages=balance.pages,
            ai_credits=balance.ai_credits,
            ocr_pages=balance.ocr_pages,
            cycle_end=cycle_end,
        ),
        can_purchase=_is_on_paid_plan(current_user),
    )


@router.post("/checkout-session", response_model=AddonCheckoutResponse)
async def create_addon_checkout_session(
    payload: AddonCheckoutRequest,
    request: Request,
    current_user: CurrentUser,
    session: DbSession,
    settings: AppSettings,
) -> AddonCheckoutResponse:
    await _enforce_addons_rate_limit(current_user, "checkout-session")
    service = StripePaymentService(session, settings)
    user_agent, ip_address = _client_context(request)

    try:
        result = await service.create_addon_checkout_session(
            user=current_user,
            items=payload.items,
            user_agent=user_agent,
            ip_address=ip_address,
        )
    except (
        StripeConfigurationError,
        StripePlanUnavailableError,
        StripeRequestError,
    ) as exc:
        raise _stripe_http_error(exc) from exc

    return AddonCheckoutResponse(
        checkout_url=result.checkout_url,
        session_id=result.session_id,
    )


@router.post("/checkout-session/sync", response_model=AddonPurchaseResponse | None)
async def sync_addon_checkout_session(
    payload: AddonCheckoutSyncRequest,
    current_user: CurrentUser,
    session: DbSession,
    settings: AppSettings,
) -> AddonPurchaseResponse | None:
    """Credit the order as soon as the browser returns from Stripe.

    The webhook remains authoritative; this only avoids the user staring at
    unchanged limits while it is in flight. Both paths are idempotent.
    """
    await _enforce_addons_rate_limit(current_user, "checkout-session-sync")
    service = StripePaymentService(session, settings)

    try:
        purchase = await service.sync_addon_checkout_session(
            user=current_user,
            session_id=payload.session_id,
        )
    except (
        StripeConfigurationError,
        StripePlanUnavailableError,
        StripeRequestError,
    ) as exc:
        raise _stripe_http_error(exc) from exc

    if purchase is None:
        return None
    return AddonPurchaseResponse.model_validate(purchase)


@router.get("/purchases", response_model=list[AddonPurchaseResponse])
async def list_addon_purchases(
    current_user: CurrentUser,
    session: DbSession,
) -> list[AddonPurchaseResponse]:
    """Paid orders only: an abandoned checkout is not a purchase."""
    purchases = list(
        (
            await session.scalars(
                select(AddonPurchase)
                .where(
                    AddonPurchase.user_id == current_user.id,
                    AddonPurchase.status == PURCHASE_PAID,
                )
                .order_by(AddonPurchase.paid_at.desc())
                .limit(50)
            )
        ).all()
    )
    return [AddonPurchaseResponse.model_validate(item) for item in purchases]


async def _all_resources(session: DbSession) -> list[AddonResource]:
    return list(
        (
            await session.scalars(
                select(AddonResource).order_by(
                    AddonResource.sort_order,
                    AddonResource.created_at,
                )
            )
        ).all()
    )


@router.get("/admin", response_model=list[AdminAddonResourceResponse])
async def get_admin_addon_resources(
    _: CurrentAdminUser,
    session: DbSession,
) -> list[AdminAddonResourceResponse]:
    resources = await _all_resources(session)
    return [
        AdminAddonResourceResponse.model_validate(resource) for resource in resources
    ]


@router.put("/admin", response_model=list[AdminAddonResourceResponse])
async def update_admin_addon_resources(
    payload: AdminAddonResourcesUpdate,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
) -> list[AdminAddonResourceResponse]:
    """Replace the catalogue of sellable resources.

    Resources missing from the payload are hidden rather than deleted: past
    orders were priced against them, and they have to stay readable for
    support and invoicing long after they stop being offered.
    """
    keys = [entry.resource_key for entry in payload.resources]
    if len(set(keys)) != len(keys):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fiecare resursa poate aparea o singura data.",
        )

    existing = {resource.id: resource for resource in await _all_resources(session)}
    submitted_ids: set[uuid.UUID] = set()

    for entry in payload.resources:
        resource = existing.get(entry.id) if entry.id is not None else None
        if resource is None:
            resource = AddonResource(
                resource_key=entry.resource_key,
                name=entry.name,
                unit_label=entry.unit_label,
                unit_price_ron=entry.unit_price_ron,
            )
            session.add(resource)

        resource.resource_key = entry.resource_key
        resource.name = entry.name
        resource.unit_label = entry.unit_label
        resource.description = entry.description
        resource.unit_price_ron = entry.unit_price_ron
        resource.stripe_product_id = entry.stripe_product_id
        resource.stripe_price_id = entry.stripe_price_id
        resource.min_quantity = entry.min_quantity
        resource.max_quantity = entry.max_quantity
        resource.step = entry.step
        resource.is_visible = entry.is_visible
        resource.sort_order = entry.sort_order

        if entry.id is not None:
            submitted_ids.add(entry.id)

    for resource_id, resource in existing.items():
        if resource_id not in submitted_ids:
            resource.is_visible = False

    add_audit_log(
        session,
        action="admin.addon_resources.updated",
        actor=admin_user,
        resource_type="addon_resources",
        resource_id=None,
        details={"resource_keys": keys, "resource_count": len(payload.resources)},
        ip_address=request.client.host if request.client is not None else None,
        user_agent=(request.headers.get("user-agent") or "")[:512] or None,
    )

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Resursa sau pretul Stripe este deja folosit.",
        ) from exc

    refreshed = await _all_resources(session)
    return [
        AdminAddonResourceResponse.model_validate(resource) for resource in refreshed
    ]

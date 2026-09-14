import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.dependencies import AppSettings, CurrentAdminUser, DbSession
from app.core.i18n import normalize_language, t
from app.core.security import generate_session_token, hash_session_token
from app.models import (
    AuthSession,
    ManualPlanGrant,
    PendingRegistration,
    StudyProject,
    User,
    UserSubscription,
)
from app.schemas.admin_users import (
    AdminManualPlanGrantRequest,
    AdminManualPlanRevokeRequest,
    AdminSubscriptionActionResponse,
    AdminUserManualGrantResponse,
    AdminUserProjectCounts,
    AdminUserResponse,
    AdminUserSessionResponse,
    AdminUserSubscriptionResponse,
    AdminUserUpdate,
    AdminUserUsageEntry,
    AdminUserUsageResponse,
)
from app.services.ai_credits import (
    AiCreditsService,
    monthly_ai_credits,
    monthly_ocr_pages,
)
from app.services.audit import add_audit_log
from app.services.billing_window import current_billing_window
from app.services.email import (
    EmailDeliveryError,
    EmailMessage,
    EmailService,
    account_deleted_email,
    email_logo_html,
    verification_email,
)
from app.services.projects import StudyProjectService, limits_for_user
from app.services.stripe_payments import (
    StripeConfigurationError,
    StripePaymentService,
    StripePlanUnavailableError,
    StripeRequestError,
)

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])


def _session_status(session: AuthSession, now: datetime) -> str:
    if session.revoked_at is not None:
        return "revocată"
    if session.expires_at <= now:
        return "expirată"
    return "activă"


def _session_response(
    auth_session: AuthSession,
    now: datetime,
) -> AdminUserSessionResponse:
    return AdminUserSessionResponse(
        id=auth_session.id,
        created_at=auth_session.created_at,
        expires_at=auth_session.expires_at,
        revoked_at=auth_session.revoked_at,
        status=_session_status(auth_session, now),
        user_agent=auth_session.user_agent,
        ip_address=str(auth_session.ip_address) if auth_session.ip_address else None,
    )


def _manual_grant_response(
    grant: ManualPlanGrant | None,
) -> AdminUserManualGrantResponse | None:
    if grant is None:
        return None
    return AdminUserManualGrantResponse(
        id=grant.id,
        plan_slug=grant.plan.slug,
        plan_name=grant.plan.name,
        reason=grant.reason,
        granted_by_email=grant.granted_by.email if grant.granted_by else None,
        created_at=grant.created_at,
    )


def _subscription_response(
    user: User,
    subscription: UserSubscription | None,
    grant: ManualPlanGrant | None,
) -> AdminUserSubscriptionResponse:
    plan = user.current_plan
    return AdminUserSubscriptionResponse(
        current_plan_slug=plan.slug if plan is not None else None,
        current_plan_name=plan.name if plan is not None else None,
        current_plan_price_ron=plan.price_ron if plan is not None else None,
        stripe_customer_id=user.stripe_customer_id,
        stripe_subscription_id=(
            subscription.stripe_subscription_id if subscription else None
        ),
        status=subscription.status if subscription else None,
        cancel_at_period_end=(
            subscription.cancel_at_period_end if subscription else False
        ),
        current_period_start=(
            subscription.current_period_start if subscription else None
        ),
        current_period_end=subscription.current_period_end if subscription else None,
        canceled_at=subscription.canceled_at if subscription else None,
        manual_grant=_manual_grant_response(grant),
    )


async def _load_billing_context(
    session: DbSession,
    users: list[User],
) -> tuple[
    dict[uuid.UUID, UserSubscription],
    dict[uuid.UUID, ManualPlanGrant],
]:
    """Latest subscription and live manual grant per user, in two queries.

    Done in bulk so the user list does not fan out into a query per row.
    """
    if not users:
        return {}, {}

    user_ids = [user.id for user in users]

    # DISTINCT ON keeps one row per user in the database instead of hydrating
    # every historical subscription just to discard all but the newest. A
    # single long-lived account can easily hold dozens of them.
    rows = await session.scalars(
        select(UserSubscription)
        .where(UserSubscription.user_id.in_(user_ids))
        .order_by(
            UserSubscription.user_id,
            UserSubscription.updated_at.desc(),
            UserSubscription.created_at.desc(),
        )
        .distinct(UserSubscription.user_id)
    )
    subscriptions = {row.user_id: row for row in rows}

    grant_rows = await session.scalars(
        select(ManualPlanGrant)
        .options(
            selectinload(ManualPlanGrant.plan),
            selectinload(ManualPlanGrant.granted_by),
        )
        .where(
            ManualPlanGrant.user_id.in_(user_ids),
            ManualPlanGrant.revoked_at.is_(None),
        )
        .order_by(
            ManualPlanGrant.user_id,
            ManualPlanGrant.created_at.desc(),
        )
        .distinct(ManualPlanGrant.user_id)
    )
    grants = {row.user_id: row for row in grant_rows}

    return subscriptions, grants


def _user_response(
    user: User,
    now: datetime,
    subscription: UserSubscription | None = None,
    grant: ManualPlanGrant | None = None,
) -> AdminUserResponse:
    sessions = sorted(user.sessions, key=lambda item: item.created_at, reverse=True)
    session_responses = [
        _session_response(auth_session, now) for auth_session in sessions
    ]
    active_sessions = sum(
        1
        for auth_session in sessions
        if _session_status(auth_session, now) == "activă"
    )
    last_session_at = sessions[0].created_at if sessions else None
    last_seen_at = next(
        (
            auth_session.created_at
            for auth_session in sessions
            if auth_session.revoked_at is None and auth_session.expires_at > now
        ),
        last_session_at,
    )

    return AdminUserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        role=user.role.strip().lower(),
        created_at=user.created_at,
        updated_at=user.updated_at,
        terms_accepted_at=user.terms_accepted_at,
        terms_version=user.terms_version,
        newsletter_consent=user.newsletter_consent,
        newsletter_consent_at=user.newsletter_consent_at,
        theme_preference=user.theme_preference,
        total_sessions=len(sessions),
        active_sessions=active_sessions,
        last_session_at=last_session_at,
        last_seen_at=last_seen_at,
        sessions=session_responses,
        subscription=_subscription_response(user, subscription, grant),
    )


async def _get_user_for_usage_or_404(
    session: DbSession,
    user_id: uuid.UUID,
) -> User:
    """Load a user without their auth sessions.

    _get_user_or_404 eagerly loads every session because the endpoints that
    use it revoke them. The usage view never reads one, and a long-lived
    account can hold hundreds.
    """
    user = await session.scalar(
        select(User)
        .options(selectinload(User.current_plan))
        .where(User.id == user_id)
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilizatorul nu exista.",
        )
    return user


async def _single_user_response(
    session: DbSession,
    user: User,
) -> AdminUserResponse:
    """One user with the billing block filled in.

    Every endpoint that returns a user has to go through here, otherwise the
    response would claim the user has no plan at all.
    """
    subscriptions, grants = await _load_billing_context(session, [user])
    return _user_response(
        user,
        datetime.now(UTC),
        subscriptions.get(user.id),
        grants.get(user.id),
    )


async def _get_user_or_404(session: DbSession, user_id: uuid.UUID) -> User:
    user = await session.scalar(
        select(User)
        .options(selectinload(User.sessions), selectinload(User.current_plan))
        .where(User.id == user_id)
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilizatorul nu exista.",
        )
    return user


async def _active_admin_count(session: DbSession) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(User)
        .where(func.lower(func.trim(User.role)) == "admin", User.is_active.is_(True))
    )
    return int(count or 0)


async def _ensure_not_last_active_admin(session: DbSession, user: User) -> None:
    if user.role.strip().lower() != "admin" or not user.is_active:
        return

    if await _active_admin_count(session) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nu poti elimina ultimul administrator activ.",
        )


def _revoke_user_sessions(user: User, now: datetime) -> int:
    revoked_sessions = 0
    for auth_session in user.sessions:
        if auth_session.revoked_at is None and auth_session.expires_at > now:
            auth_session.revoked_at = now
            revoked_sessions += 1
    return revoked_sessions


def _verification_url(settings: AppSettings, token: str) -> str:
    return f"{settings.public_app_url}/verify-email?token={token}"


def _hash_token(settings: AppSettings, token: str) -> str:
    return hash_session_token(
        token,
        settings.session_secret.get_secret_value(),
    )


def _request_context(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    if user_agent is not None:
        user_agent = user_agent[:512]
    ip_address = request.client.host if request.client is not None else None
    return user_agent, ip_address


@router.get("/", response_model=list[AdminUserResponse])
async def get_admin_users(
    _: CurrentAdminUser,
    session: DbSession,
) -> list[AdminUserResponse]:
    users = list(
        (
            await session.scalars(
                select(User)
                .options(
                    selectinload(User.sessions),
                    selectinload(User.current_plan),
                )
                .order_by(User.created_at.desc())
            )
        ).all()
    )
    now = datetime.now(UTC)
    subscriptions, grants = await _load_billing_context(session, users)
    return [
        _user_response(
            user,
            now,
            subscriptions.get(user.id),
            grants.get(user.id),
        )
        for user in users
    ]


@router.patch("/{user_id}", response_model=AdminUserResponse)
async def update_admin_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    admin_user: CurrentAdminUser,
    session: DbSession,
) -> AdminUserResponse:
    target_user = await _get_user_or_404(session, user_id)
    now = datetime.now(UTC)
    changes: dict[str, object] = {}
    revoked_sessions = 0

    if payload.role is not None:
        current_role = target_user.role.strip().lower()
        if target_user.id == admin_user.id and payload.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nu iti poti elimina propriul rol de administrator.",
            )

        if current_role != payload.role:
            if current_role == "admin" and payload.role != "admin":
                await _ensure_not_last_active_admin(session, target_user)
            target_user.role = payload.role
            changes["role"] = {"from": current_role, "to": payload.role}
            revoked_sessions += _revoke_user_sessions(target_user, now)

    if payload.is_active is not None and payload.is_active != target_user.is_active:
        if target_user.id == admin_user.id and not payload.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nu iti poti dezactiva propriul cont.",
            )

        if not payload.is_active:
            await _ensure_not_last_active_admin(session, target_user)
            revoked_sessions += _revoke_user_sessions(target_user, now)

        changes["is_active"] = {
            "from": target_user.is_active,
            "to": payload.is_active,
        }
        target_user.is_active = payload.is_active

    if changes:
        add_audit_log(
            session,
            action="admin.user.update",
            actor=admin_user,
            resource_type="user",
            resource_id=str(target_user.id),
            details={
                "target_email": target_user.email,
                "target_name": target_user.full_name,
                "changes": changes,
                "revoked_sessions": revoked_sessions,
            },
        )
        await session.commit()
        target_user = await _get_user_or_404(session, user_id)

    return await _single_user_response(session, target_user)


@router.post("/{user_id}/verification-email", response_model=AdminUserResponse)
async def send_admin_user_verification_email(
    user_id: uuid.UUID,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    settings: AppSettings,
) -> AdminUserResponse:
    target_user = await _get_user_or_404(session, user_id)
    if target_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contul este deja activ.",
        )

    token = generate_session_token()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.email_verification_ttl_minutes)
    pending = await session.scalar(
        select(PendingRegistration).where(
            PendingRegistration.email == target_user.email
        )
    )
    if pending is None:
        pending = PendingRegistration(email=target_user.email)
        session.add(pending)

    pending.full_name = target_user.full_name
    pending.password_hash = target_user.password_hash
    pending.token_hash = _hash_token(settings, token)
    pending.accepted_terms = True
    pending.terms_version = target_user.terms_version
    pending.newsletter_consent = target_user.newsletter_consent
    pending.expires_at = expires_at
    pending.used_at = None
    pending.updated_at = now

    user_agent, ip_address = _request_context(request)
    add_audit_log(
        session,
        action="admin.user.verification_email_requested",
        actor=admin_user,
        resource_type="user",
        resource_id=str(target_user.id),
        details={
            "target_email": target_user.email,
            "target_name": target_user.full_name,
            "expires_at": expires_at,
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await session.flush()

    # The recipient's own language, not the administrator's.
    language = normalize_language(target_user.language_preference)
    html, text = verification_email(
        verification_url=_verification_url(settings, token),
        logo_html=email_logo_html(settings.email_logo_url, app_name="Reviss"),
        language=language,
    )
    try:
        await EmailService(settings).send(
            EmailMessage(
                to=target_user.email,
                subject=t("email.verification.subject", language),
                html=html,
                text=text,
            )
        )
        await session.commit()
    except EmailDeliveryError as exc:
        await session.rollback()
        add_audit_log(
            session,
            action="admin.user.verification_email_failed",
            status="failure",
            actor=admin_user,
            resource_type="user",
            resource_id=str(target_user.id),
            details={
                "target_email": target_user.email,
                "reason": str(exc),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Emailul de verificare nu a putut fi trimis momentan.",
        ) from exc

    target_user = await _get_user_or_404(session, user_id)
    return await _single_user_response(session, target_user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_user(
    user_id: uuid.UUID,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    settings: AppSettings,
) -> Response:
    target_user = await _get_user_or_404(session, user_id)

    if target_user.id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nu iti poti sterge propriul cont de administrator.",
        )

    await _ensure_not_last_active_admin(session, target_user)

    user_agent, ip_address = _request_context(request)
    target_snapshot = {
        "target_language": target_user.language_preference,
        "target_user_id": str(target_user.id),
        "target_email": target_user.email,
        "target_name": target_user.full_name,
        "target_role": target_user.role.strip().lower(),
        "target_is_active": target_user.is_active,
    }
    admin_snapshot = {
        "id": admin_user.id,
        "email": admin_user.email,
        "name": admin_user.full_name,
    }

    add_audit_log(
        session,
        action="admin.user.delete",
        actor=admin_user,
        resource_type="user",
        resource_id=str(target_user.id),
        details=target_snapshot,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await session.delete(target_user)
    await session.flush()

    language = normalize_language(target_snapshot.get("target_language"))
    html, text = account_deleted_email(
        app_url=settings.public_app_url,
        full_name=target_snapshot["target_name"],
        logo_html=email_logo_html(settings.email_logo_url, app_name="Reviss"),
        language=language,
    )
    try:
        await EmailService(settings).send(
            EmailMessage(
                to=target_snapshot["target_email"],
                subject=t("email.account_deleted.subject", language),
                html=html,
                text=text,
            )
        )
    except EmailDeliveryError as exc:
        await session.rollback()
        add_audit_log(
            session,
            action="admin.user.delete_email_failed",
            status="failure",
            actor_user_id=admin_snapshot["id"],
            actor_email=admin_snapshot["email"],
            actor_name=admin_snapshot["name"],
            resource_type="user",
            resource_id=str(user_id),
            details={**target_snapshot, "reason": str(exc)},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Utilizatorul nu a fost șters deoarece emailul de confirmare "
                "nu a putut fi trimis."
            ),
        ) from exc

    await session.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)

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


async def _subscription_action_response(
    session: DbSession,
    user: User,
    message: str,
) -> AdminSubscriptionActionResponse:
    subscriptions, grants = await _load_billing_context(session, [user])
    return AdminSubscriptionActionResponse(
        subscription=_subscription_response(
            user,
            subscriptions.get(user.id),
            grants.get(user.id),
        ),
        message=message,
    )


@router.post(
    "/{user_id}/subscription/resync",
    response_model=AdminSubscriptionActionResponse,
)
async def resync_admin_user_subscription(
    user_id: uuid.UUID,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    settings: AppSettings,
) -> AdminSubscriptionActionResponse:
    """Replay the user's real Stripe state onto our records.

    The repair path for a payment that succeeded in Stripe while the webhook
    that should have applied the plan never arrived.
    """
    target_user = await _get_user_or_404(session, user_id)
    user_agent, ip_address = _request_context(request)
    service = StripePaymentService(session, settings)

    try:
        refreshed_user, seen = await service.admin_resync_subscriptions(
            user=target_user,
            actor=admin_user,
            user_agent=user_agent,
            ip_address=ip_address,
        )
    except (
        StripeConfigurationError,
        StripePlanUnavailableError,
        StripeRequestError,
    ) as exc:
        raise _stripe_http_error(exc) from exc

    return await _subscription_action_response(
        session,
        refreshed_user,
        f"Sincronizare finalizata: {seen} abonamente citite din Stripe.",
    )


@router.post(
    "/{user_id}/subscription/cancel",
    response_model=AdminSubscriptionActionResponse,
)
async def cancel_admin_user_subscription(
    user_id: uuid.UUID,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    settings: AppSettings,
) -> AdminSubscriptionActionResponse:
    target_user = await _get_user_or_404(session, user_id)
    user_agent, ip_address = _request_context(request)
    service = StripePaymentService(session, settings)

    try:
        refreshed_user, _ = await service.schedule_subscription_cancellation(
            user=target_user,
            user_agent=user_agent,
            ip_address=ip_address,
            actor=admin_user,
        )
    except (
        StripeConfigurationError,
        StripePlanUnavailableError,
        StripeRequestError,
    ) as exc:
        raise _stripe_http_error(exc) from exc

    return await _subscription_action_response(
        session,
        refreshed_user,
        "Reinnoirea a fost oprita. Accesul ramane pana la finalul perioadei platite.",
    )


@router.post(
    "/{user_id}/subscription/resume",
    response_model=AdminSubscriptionActionResponse,
)
async def resume_admin_user_subscription(
    user_id: uuid.UUID,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    settings: AppSettings,
) -> AdminSubscriptionActionResponse:
    target_user = await _get_user_or_404(session, user_id)
    user_agent, ip_address = _request_context(request)
    service = StripePaymentService(session, settings)

    try:
        refreshed_user, _ = await service.resume_subscription_renewal(
            user=target_user,
            user_agent=user_agent,
            ip_address=ip_address,
            actor=admin_user,
        )
    except (
        StripeConfigurationError,
        StripePlanUnavailableError,
        StripeRequestError,
    ) as exc:
        raise _stripe_http_error(exc) from exc

    return await _subscription_action_response(
        session,
        refreshed_user,
        "Reinnoirea abonamentului a fost reactivata.",
    )


@router.post(
    "/{user_id}/subscription/manual-plan",
    response_model=AdminSubscriptionActionResponse,
)
async def grant_admin_user_manual_plan(
    user_id: uuid.UUID,
    payload: AdminManualPlanGrantRequest,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    settings: AppSettings,
) -> AdminSubscriptionActionResponse:
    """Put a user on a plan without Stripe, for comped or broken accounts."""
    target_user = await _get_user_or_404(session, user_id)
    user_agent, ip_address = _request_context(request)
    service = StripePaymentService(session, settings)

    try:
        refreshed_user, _ = await service.admin_grant_manual_plan(
            user=target_user,
            actor=admin_user,
            plan_slug=payload.plan_slug,
            reason=payload.reason if payload else None,
            user_agent=user_agent,
            ip_address=ip_address,
        )
    except (
        StripeConfigurationError,
        StripePlanUnavailableError,
        StripeRequestError,
    ) as exc:
        raise _stripe_http_error(exc) from exc

    return await _subscription_action_response(
        session,
        refreshed_user,
        "Planul a fost acordat manual.",
    )


@router.delete(
    "/{user_id}/subscription/manual-plan",
    response_model=AdminSubscriptionActionResponse,
)
async def revoke_admin_user_manual_plan(
    user_id: uuid.UUID,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    settings: AppSettings,
    payload: AdminManualPlanRevokeRequest | None = None,
) -> AdminSubscriptionActionResponse:
    target_user = await _get_user_or_404(session, user_id)
    user_agent, ip_address = _request_context(request)
    service = StripePaymentService(session, settings)

    try:
        refreshed_user = await service.admin_revoke_manual_plan(
            user=target_user,
            actor=admin_user,
            reason=payload.reason,
            user_agent=user_agent,
            ip_address=ip_address,
        )
    except (
        StripeConfigurationError,
        StripePlanUnavailableError,
        StripeRequestError,
    ) as exc:
        raise _stripe_http_error(exc) from exc

    return await _subscription_action_response(
        session,
        refreshed_user,
        "Planul acordat manual a fost revocat.",
    )

async def _build_usage_response(
    session: DbSession,
    settings: AppSettings,
    target_user: User,
) -> AdminUserUsageResponse:
    """What the account holds and what its plan allows.

    Reuses the same helpers the user's own usage panel calls, so support and
    the customer are always looking at identical numbers.
    """
    window_start, window_end = await current_billing_window(session, target_user)
    limits = limits_for_user(target_user)
    plan = target_user.current_plan

    projects_service = StudyProjectService(session, settings)
    credits_service = AiCreditsService(session)

    active_projects = await projects_service.count_active_projects(target_user)
    materials_used, pages_processed = await projects_service.get_monthly_usage(
        target_user,
        window=(window_start, window_end),
    )

    # One pass over the user's projects instead of a query per figure.
    # The active count stays with the service, which owns the definition of
    # "occupying a slot" and has to keep matching what list_projects returns.
    counts = await session.execute(
        select(
            func.count(StudyProject.id),
            func.count(StudyProject.id).filter(
                StudyProject.deactivated_at.is_not(None),
            ),
            func.count(StudyProject.id).filter(StudyProject.archive.has()),
            func.count(StudyProject.id).filter(
                StudyProject.created_at >= window_start,
                StudyProject.created_at < window_end,
            ),
        ).where(StudyProject.user_id == target_user.id)
    )
    (
        total_projects,
        deactivated_projects,
        archived_projects,
        monthly_projects_used,
    ) = counts.one()

    ai_credits_used = await credits_service.credits_used_this_cycle(
        target_user,
        window_start,
        window_end,
    )
    ocr_pages_used = await credits_service.ocr_pages_used_this_cycle(
        target_user,
        window_start,
        window_end,
    )

    return AdminUserUsageResponse(
        plan_slug=plan.slug if plan is not None else None,
        plan_name=plan.name if plan is not None else None,
        cycle_reset_at=window_end,
        projects=AdminUserProjectCounts(
            total=int(total_projects or 0),
            active=active_projects,
            deactivated=int(deactivated_projects or 0),
            archived=int(archived_projects or 0),
        ),
        monthly_projects=AdminUserUsageEntry(
            used=int(monthly_projects_used or 0),
            limit=limits.active_projects,
        ),
        monthly_materials=AdminUserUsageEntry(
            used=materials_used,
            limit=limits.monthly_materials,
        ),
        monthly_pages=AdminUserUsageEntry(
            used=pages_processed,
            limit=limits.monthly_page_limit,
        ),
        ai_credits=AdminUserUsageEntry(
            used=ai_credits_used,
            limit=monthly_ai_credits(target_user),
        ),
        ocr_pages=AdminUserUsageEntry(
            used=ocr_pages_used,
            limit=monthly_ocr_pages(target_user),
        ),
        active_project_slots=limits.active_projects,
        files_per_project_limit=limits.files_per_project,
        file_size_limit_mb=limits.file_mb,
        project_size_limit_mb=limits.total_project_mb,
        quizzes_per_project_limit=limits.quizzes_per_project,
        allow_scanned_documents=limits.allow_scanned_documents,
    )

@router.get("/{user_id}/usage", response_model=AdminUserUsageResponse)
async def get_admin_user_usage(
    user_id: uuid.UUID,
    _: CurrentAdminUser,
    session: DbSession,
    settings: AppSettings,
) -> AdminUserUsageResponse:
    target_user = await _get_user_for_usage_or_404(session, user_id)
    return await _build_usage_response(session, settings, target_user)


@router.post("/{user_id}/usage/reset", response_model=AdminUserUsageResponse)
async def reset_admin_user_usage(
    user_id: uuid.UUID,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    settings: AppSettings,
) -> AdminUserUsageResponse:
    """Start this account's usage cycle over, right now.

    Nothing is deleted: usage is derived by counting rows inside the billing
    window, so the reset simply moves that window's start to this moment. The
    account's history, invoices and AI spend records all stay intact.
    """
    target_user = await _get_user_for_usage_or_404(session, user_id)
    now = datetime.now(UTC)

    before = await _build_usage_response(session, settings, target_user)
    target_user.usage_reset_at = now

    add_audit_log(
        session,
        action="admin.usage.reset",
        actor=admin_user,
        resource_type="user",
        resource_id=str(target_user.id),
        details={
            "target_user_email": target_user.email,
            "plan_slug": before.plan_slug,
            # What the account had consumed at the moment it was wiped, so the
            # trail says what was actually given away.
            "released_projects": before.monthly_projects.used,
            "released_materials": before.monthly_materials.used,
            "released_pages": before.monthly_pages.used,
            "released_ai_credits": before.ai_credits.used,
            "released_ocr_pages": before.ocr_pages.used,
        },
        ip_address=_request_context(request)[1],
        user_agent=_request_context(request)[0],
    )
    await session.commit()

    return await _build_usage_response(session, settings, target_user)


import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.dependencies import AppSettings, CurrentAdminUser, DbSession
from app.core.i18n import normalize_language, t
from app.core.security import generate_session_token, hash_session_token
from app.models import AuthSession, PendingRegistration, User
from app.schemas.admin_users import (
    AdminUserResponse,
    AdminUserSessionResponse,
    AdminUserUpdate,
)
from app.services.audit import add_audit_log
from app.services.email import (
    EmailDeliveryError,
    EmailMessage,
    EmailService,
    account_deleted_email,
    email_logo_html,
    verification_email,
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


def _user_response(user: User, now: datetime) -> AdminUserResponse:
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
    )


async def _get_user_or_404(session: DbSession, user_id: uuid.UUID) -> User:
    user = await session.scalar(
        select(User).options(selectinload(User.sessions)).where(User.id == user_id)
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
                .options(selectinload(User.sessions))
                .order_by(User.created_at.desc())
            )
        ).all()
    )
    now = datetime.now(UTC)
    return [_user_response(user, now) for user in users]


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

    return _user_response(target_user, datetime.now(UTC))


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
    return _user_response(target_user, datetime.now(UTC))


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

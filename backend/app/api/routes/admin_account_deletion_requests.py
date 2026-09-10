import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError

from app.api.dependencies import AppSettings, CurrentAdminUser, DbSession
from app.core.i18n import normalize_language, t
from app.models import AccountDeletionRequest, User
from app.schemas.admin_account_deletion_requests import (
    AccountDeletionRequestStatus,
    AdminAccountDeletionRequestResponse,
)
from app.services.audit import add_audit_log
from app.services.email import (
    EmailDeliveryError,
    EmailMessage,
    EmailService,
    account_deleted_email,
    email_logo_html,
)

router = APIRouter(
    prefix="/api/admin/account-deletion-requests",
    tags=["admin-account-deletion-requests"],
)

MAX_USER_AGENT_LENGTH = 512


def _request_context(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    if user_agent is not None:
        user_agent = user_agent[:MAX_USER_AGENT_LENGTH]
    ip_address = request.client.host if request.client is not None else None
    return user_agent, ip_address


def _request_response(
    deletion_request: AccountDeletionRequest,
) -> AdminAccountDeletionRequestResponse:
    return AdminAccountDeletionRequestResponse.model_validate(deletion_request)


async def _get_deletion_request_or_404(
    session: DbSession,
    request_id: uuid.UUID,
) -> AccountDeletionRequest:
    deletion_request = await session.get(AccountDeletionRequest, request_id)
    if deletion_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitarea de ștergere nu există.",
        )
    return deletion_request


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
            detail="Nu poți șterge ultimul administrator activ.",
        )


@router.get("/", response_model=list[AdminAccountDeletionRequestResponse])
async def get_admin_account_deletion_requests(
    _: CurrentAdminUser,
    session: DbSession,
    request_status: Annotated[AccountDeletionRequestStatus | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=320)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[AdminAccountDeletionRequestResponse]:
    query = (
        select(AccountDeletionRequest)
        .order_by(
            AccountDeletionRequest.created_at.desc(),
            AccountDeletionRequest.id.asc(),
        )
        .limit(limit)
    )

    if request_status:
        query = query.where(AccountDeletionRequest.status == request_status)

    normalized_search = search.strip() if search else ""
    if normalized_search:
        search_pattern = f"%{normalized_search}%"
        query = query.where(
            or_(
                AccountDeletionRequest.full_name.ilike(search_pattern),
                AccountDeletionRequest.email.ilike(search_pattern),
                AccountDeletionRequest.status.ilike(search_pattern),
                AccountDeletionRequest.resolution_note.ilike(search_pattern),
                AccountDeletionRequest.ip_address.ilike(search_pattern),
            )
        )

    try:
        requests = list((await session.scalars(query)).all())
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Solicitările de ștergere nu pot fi încărcate momentan.",
        ) from exc
    return [_request_response(item) for item in requests]


@router.delete(
    "/{request_id}/user",
    response_model=AdminAccountDeletionRequestResponse,
)
async def delete_user_from_account_deletion_request(
    request_id: uuid.UUID,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    settings: AppSettings,
) -> AdminAccountDeletionRequestResponse:
    deletion_request = await _get_deletion_request_or_404(session, request_id)
    if deletion_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solicitarea de ștergere a fost deja rezolvată.",
        )

    now = datetime.now(UTC)
    user_agent, ip_address = _request_context(request)
    target_user = (
        await session.get(User, deletion_request.user_id)
        if deletion_request.user_id is not None
        else None
    )

    if target_user is None:
        deletion_request.status = "completed"
        deletion_request.resolved_by_user_id = admin_user.id
        deletion_request.resolved_at = now
        deletion_request.resolution_note = "Contul asociat era deja șters."
        add_audit_log(
            session,
            action="admin.account_deletion_request.completed",
            actor=admin_user,
            resource_type="account_deletion_request",
            resource_id=str(deletion_request.id),
            details={
                "target_email": deletion_request.email,
                "reason": "user_already_deleted",
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await session.commit()
        return _request_response(deletion_request)

    if target_user.id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nu îți poți șterge propriul cont de administrator.",
        )

    await _ensure_not_last_active_admin(session, target_user)

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

    deletion_request.status = "completed"
    deletion_request.resolved_by_user_id = admin_user.id
    deletion_request.resolved_at = now
    deletion_request.resolution_note = "Cont șters definitiv de administrator."
    deletion_request.user_id = None

    add_audit_log(
        session,
        action="admin.account_deletion_request.completed",
        actor=admin_user,
        resource_type="account_deletion_request",
        resource_id=str(deletion_request.id),
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
            action="admin.account_deletion_request.email_failed",
            status="failure",
            actor_user_id=admin_snapshot["id"],
            actor_email=admin_snapshot["email"],
            actor_name=admin_snapshot["name"],
            resource_type="account_deletion_request",
            resource_id=str(request_id),
            details={**target_snapshot, "reason": str(exc)},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Contul nu a fost șters deoarece emailul de confirmare nu a "
                "putut fi trimis."
            ),
        ) from exc

    await session.commit()
    return _request_response(deletion_request)

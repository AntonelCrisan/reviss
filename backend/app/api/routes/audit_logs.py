from datetime import UTC, datetime
from time import monotonic
from typing import Final

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CurrentAdminUser, DbSession
from app.core.search import contains
from app.models import AuditLog
from app.schemas.audit import (
    AuditLogActionOption,
    AuditLogListResponse,
    AuditLogResponse,
)

router = APIRouter(prefix="/api/admin/audit-logs", tags=["admin-audit-logs"])

# Counting every action means reading the whole table, which no index avoids:
# 62 ms at 300k rows, and it runs on every visit to the page. The list only
# changes when a kind of event happens for the first time, so a short memory
# costs nothing but a new action taking up to a minute to appear in the filter.
_ACTIONS_CACHE_SECONDS: Final = 60
_actions_cache: tuple[float, list[AuditLogActionOption]] | None = None


def _as_utc(value: datetime) -> datetime:
    """Pin a boundary to a real instant.

    A naive datetime would otherwise be read in the database session's
    timezone, so the same filter would select different rows in development
    and in production.
    """
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _apply_filters(
    query,
    *,
    action: str | None,
    status: str | None,
    actor: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
):
    if action:
        query = query.where(AuditLog.action == action)

    if status:
        query = query.where(AuditLog.status == status)

    term = actor.strip() if actor else ""
    if term:
        # The three people-identifying columns are searched as "contains",
        # which the trigram indexes serve. resource_id is matched whole
        # instead: it holds UUIDs, where a partial match means little, and
        # indexing it for trigram search cost more than the other three
        # together while an exact match already uses ix_audit_logs_resource.
        query = query.where(
            or_(
                contains(AuditLog.actor_email, term),
                contains(AuditLog.actor_name, term),
                contains(AuditLog.ip_address, term),
                AuditLog.resource_id == term,
            )
        )

    if date_from:
        query = query.where(AuditLog.created_at >= _as_utc(date_from))

    if date_to:
        # Exclusive, and the caller decides where the day ends. The admin sees
        # timestamps rendered in their own timezone, so only the browser can
        # say which instant "the end of 14 September" is; resolving it here
        # would silently use the database server's timezone instead, which is
        # Europe/Bucharest in development and UTC in production.
        query = query.where(AuditLog.created_at < _as_utc(date_to))

    return query


async def _action_options(session: AsyncSession) -> list[AuditLogActionOption]:
    global _actions_cache

    now = monotonic()
    if _actions_cache is not None and now - _actions_cache[0] < _ACTIONS_CACHE_SECONDS:
        return _actions_cache[1]

    rows = (
        await session.execute(
            select(AuditLog.action, func.count().label("total"))
            .group_by(AuditLog.action)
            .order_by(AuditLog.action.asc())
        )
    ).all()
    options = [
        AuditLogActionOption(action=row.action, total=row.total) for row in rows
    ]
    _actions_cache = (now, options)
    return options


@router.get("/actions", response_model=list[AuditLogActionOption])
async def get_admin_audit_log_actions(
    _: CurrentAdminUser,
    session: DbSession,
) -> list[AuditLogActionOption]:
    """Every action ever recorded, so the filter can offer all of them.

    Building the list from the rows on screen would hide exactly the actions
    worth searching for: a single account deletion months ago never makes it
    into the most recent page, so it could never be filtered for either.
    """
    return await _action_options(session)


@router.get("/", response_model=AuditLogListResponse)
async def get_admin_audit_logs(
    _: CurrentAdminUser,
    session: DbSession,
    action: str | None = Query(default=None, max_length=120),
    status: str | None = Query(default=None, pattern="^(success|failure)$"),
    actor: str | None = Query(default=None, max_length=320),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> AuditLogListResponse:
    filters = {
        "action": action,
        "status": status,
        "actor": actor,
        "date_from": date_from,
        "date_to": date_to,
    }

    # Counted with the same filters, so the page count reflects the query and
    # not the size of the window that happens to be loaded.
    #
    # With no filters the answer is already known: every row has an action, so
    # the per-action totals add up to the same number, and they are cached.
    # Counting the table again costs a full scan - 43 ms at 340k rows, on every
    # visit - to reproduce a figure that is one addition away.
    if any(value is not None for value in filters.values()):
        total = await session.scalar(
            _apply_filters(select(func.count(AuditLog.id)), **filters)
        )
    else:
        total = sum(option.total for option in await _action_options(session))

    query = _apply_filters(select(AuditLog), **filters)
    query = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    query = query.offset(offset).limit(limit)

    logs = list((await session.scalars(query)).all())
    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total or 0,
    )

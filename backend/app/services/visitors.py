import hashlib
import hmac
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import contains
from app.models import VisitorVisit
from app.schemas.visitors import VisitorStatsResponse


def _compute_visitor_hash(
    *,
    secret: str,
    ip_address: str,
    user_agent: str,
    visit_date: date,
) -> str:
    material = f"{ip_address}|{user_agent}|{visit_date.isoformat()}".encode()
    return hmac.new(secret.encode(), material, hashlib.sha256).hexdigest()


async def record_anonymous_visit(
    session: AsyncSession,
    *,
    secret: str,
    ip_address: str | None,
    user_agent: str | None,
    path: str | None,
) -> bool:
    if not ip_address:
        return False

    visit_date = datetime.now(UTC).date()
    visitor_hash = _compute_visitor_hash(
        secret=secret,
        ip_address=ip_address,
        user_agent=user_agent or "unknown",
        visit_date=visit_date,
    )

    statement = (
        pg_insert(VisitorVisit)
        .values(
            visitor_hash=visitor_hash,
            visit_date=visit_date,
            path=path[:300] if path else None,
        )
        .on_conflict_do_nothing(
            index_elements=[VisitorVisit.visitor_hash, VisitorVisit.visit_date],
        )
    )
    result = await session.execute(statement)
    await session.commit()
    return result.rowcount > 0


async def get_visitor_stats(session: AsyncSession) -> VisitorStatsResponse:
    today = datetime.now(UTC).date()
    week_start = today - timedelta(days=6)
    month_start = today - timedelta(days=29)

    count_column = func.count(func.distinct(VisitorVisit.visitor_hash))

    total = await session.scalar(select(count_column))
    visitors_today = await session.scalar(
        select(count_column).where(VisitorVisit.visit_date == today)
    )
    visitors_last_7_days = await session.scalar(
        select(count_column).where(VisitorVisit.visit_date >= week_start)
    )
    visitors_last_30_days = await session.scalar(
        select(count_column).where(VisitorVisit.visit_date >= month_start)
    )

    return VisitorStatsResponse(
        total_visitors=total or 0,
        visitors_today=visitors_today or 0,
        visitors_last_7_days=visitors_last_7_days or 0,
        visitors_last_30_days=visitors_last_30_days or 0,
    )


def _apply_visit_filters(
    query,
    *,
    date_from: date | None,
    date_to: date | None,
    path: str | None,
):
    if date_from:
        query = query.where(VisitorVisit.visit_date >= date_from)

    if date_to:
        query = query.where(VisitorVisit.visit_date <= date_to)

    term = path.strip() if path else ""
    if term:
        query = query.where(contains(VisitorVisit.path, term))

    return query


async def count_visitor_visits(
    session: AsyncSession,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    path: str | None = None,
) -> int:
    query = _apply_visit_filters(
        select(func.count(VisitorVisit.id)),
        date_from=date_from,
        date_to=date_to,
        path=path,
    )
    return await session.scalar(query) or 0


async def list_visitor_visits(
    session: AsyncSession,
    *,
    limit: int,
    offset: int = 0,
    date_from: date | None = None,
    date_to: date | None = None,
    path: str | None = None,
) -> list[VisitorVisit]:
    query = _apply_visit_filters(
        select(VisitorVisit),
        date_from=date_from,
        date_to=date_to,
        path=path,
    )
    # visit_date leads the sort because it carries the index; created_at only
    # breaks ties inside a day, and id makes the order total so paging cannot
    # show the same row twice.
    query = query.order_by(
        VisitorVisit.visit_date.desc(),
        VisitorVisit.created_at.desc(),
        VisitorVisit.id.desc(),
    )
    return list((await session.scalars(query.offset(offset).limit(limit))).all())

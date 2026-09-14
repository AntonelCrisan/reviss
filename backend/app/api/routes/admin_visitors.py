from datetime import date

from fastapi import APIRouter, Query

from app.api.dependencies import CurrentAdminUser, DbSession
from app.schemas.visitors import (
    VisitorStatsResponse,
    VisitorVisitListResponse,
    VisitorVisitResponse,
)
from app.services.visitors import (
    count_visitor_visits,
    get_visitor_stats,
    list_visitor_visits,
)

router = APIRouter(prefix="/api/admin", tags=["admin-visitors"])


@router.get("/visitor-stats", response_model=VisitorStatsResponse)
async def get_admin_visitor_stats(
    _: CurrentAdminUser,
    session: DbSession,
) -> VisitorStatsResponse:
    return await get_visitor_stats(session)


@router.get("/visitor-visits", response_model=VisitorVisitListResponse)
async def get_admin_visitor_visits(
    _: CurrentAdminUser,
    session: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
    path: str | None = Query(default=None, max_length=300),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> VisitorVisitListResponse:
    filters = {"date_from": date_from, "date_to": date_to, "path": path}

    total = await count_visitor_visits(session, **filters)
    visits = await list_visitor_visits(
        session,
        limit=limit,
        offset=offset,
        **filters,
    )
    return VisitorVisitListResponse(
        items=[VisitorVisitResponse.model_validate(visit) for visit in visits],
        total=total,
    )

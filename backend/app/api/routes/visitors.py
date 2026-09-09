from fastapi import APIRouter, Request

from app.api.dependencies import AppSettings, DbSession, OptionalCurrentUser
from app.api.security import client_ip
from app.core.rate_limit import consume_rate_limit
from app.schemas.visitors import VisitorPingRequest, VisitorPingResponse
from app.services.visitors import record_anonymous_visit

router = APIRouter(prefix="/api/visits", tags=["visitors"])

VISIT_RATE_LIMIT_WINDOW_SECONDS = 3600
VISIT_RATE_LIMIT_MAX_REQUESTS = 120


def _client_ip(request: Request) -> str | None:
    return client_ip(request)


@router.post("/ping", response_model=VisitorPingResponse)
async def ping_visit(
    payload: VisitorPingRequest,
    request: Request,
    session: DbSession,
    settings: AppSettings,
    current_user: OptionalCurrentUser,
) -> VisitorPingResponse:
    if current_user is not None:
        return VisitorPingResponse(tracked=False)

    ip_address = _client_ip(request)
    if ip_address is None:
        return VisitorPingResponse(tracked=False)

    await consume_rate_limit(
        bucket_key=f"visits:{ip_address}",
        max_requests=VISIT_RATE_LIMIT_MAX_REQUESTS,
        window_seconds=VISIT_RATE_LIMIT_WINDOW_SECONDS,
        error_message="Prea multe solicitări.",
    )

    tracked = await record_anonymous_visit(
        session,
        secret=settings.session_secret.get_secret_value(),
        ip_address=ip_address,
        user_agent=request.headers.get("user-agent"),
        path=payload.path,
    )
    return VisitorPingResponse(tracked=tracked)

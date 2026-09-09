import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.admin_account_deletion_requests import (
    router as admin_account_deletion_requests_router,
)
from app.api.routes.admin_contact_messages import (
    router as admin_contact_messages_router,
)
from app.api.routes.admin_content_reports import (
    router as admin_content_reports_router,
)
from app.api.routes.admin_users import router as admin_users_router
from app.api.routes.admin_visitors import router as admin_visitors_router
from app.api.routes.admin_withdrawal_requests import (
    router as admin_withdrawal_requests_router,
)
from app.api.routes.ai_rates import router as ai_rates_router
from app.api.routes.audit_logs import router as audit_logs_router
from app.api.routes.auth import router as auth_router
from app.api.routes.compliance import router as compliance_router
from app.api.routes.health import router as health_router
from app.api.routes.internal import router as internal_router
from app.api.routes.legal import router as legal_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.payments import router as payments_router
from app.api.routes.plans import router as plans_router
from app.api.routes.projects import router as projects_router
from app.api.routes.visitors import router as visitors_router
from app.core.config import get_settings
from app.core.rate_limit import (
    close_rate_limit_backend,
    configure_rate_limit_backend,
    rate_limit_backend_name,
)
from app.db.session import engine
from app.services.plan_errors import PlanLimitError

logger = logging.getLogger("revizzio")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await configure_rate_limit_backend(
        settings.redis_url,
        redis_required=settings.rate_limit_redis_required,
    )
    if rate_limit_backend_name() == "redis":
        logger.info("Redis conectat pentru rate limiting.")
    else:
        logger.warning(
            "Redis nu este conectat; rate limiting foloseste memoria procesului."
        )
    if settings.mistral_api_key is not None:
        logger.info("Mistral OCR configurat pentru documente scanate pe planul Pro.")
    else:
        logger.warning(
            "Mistral OCR nu este configurat; PDF-urile scanate pe planul Pro "
            "nu pot fi procesate momentan."
        )
    logger.info(
        "Reviss API rulează în mediul %s și este pregătit.",
        settings.environment,
    )
    yield
    await close_rate_limit_backend()
    await engine.dispose()
    logger.info("Reviss API a fost oprit.")


app = FastAPI(
    title="Reviss API",
    description="API pentru aplicatia Reviss.",
    version="0.1.0",
    lifespan=lifespan,
    # The interactive docs enumerate every route and schema; that is useful
    # locally and a free map of the API for anyone else in production.
    docs_url=None if settings.environment == "production" else "/docs",
    redoc_url=None if settings.environment == "production" else "/redoc",
    openapi_url=None if settings.environment == "production" else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "X-Reviss-Form-Intent",
    ],
)


@app.exception_handler(PlanLimitError)
async def plan_limit_error_handler(
    _: Request,
    exc: PlanLimitError,
) -> JSONResponse:
    """Map every plan/usage limit to the shape the frontend already reads.

    Registered globally because these are raised deep in the service layer --
    notably from ProjectService.get_project, which has dozens of call sites --
    so a per-route try/except would leave gaps that surface as 500s.
    """
    logger.warning("Plan limit hit: %s (%s)", exc, exc.code)
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": {"code": exc.code, "message": str(exc)}},
    )


app.include_router(health_router)
app.include_router(internal_router)
app.include_router(auth_router)
app.include_router(admin_account_deletion_requests_router)
app.include_router(admin_contact_messages_router)
app.include_router(admin_content_reports_router)
app.include_router(admin_users_router)
app.include_router(admin_visitors_router)
app.include_router(admin_withdrawal_requests_router)
app.include_router(ai_rates_router)
app.include_router(audit_logs_router)
app.include_router(compliance_router)
app.include_router(legal_router)
app.include_router(notifications_router)
app.include_router(payments_router)
app.include_router(plans_router)
app.include_router(projects_router)
app.include_router(visitors_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "Reviss API",
        "docs": "/docs",
    }

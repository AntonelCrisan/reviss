import hmac

from fastapi import APIRouter, HTTPException, Request, status

from app.api.dependencies import AppSettings, DbSession
from app.services.notifications import NotificationService
from app.services.usage_alerts import UsageAlertService

router = APIRouter(prefix="/api/internal", tags=["internal"])


@router.post("/notifications/run-daily")
async def run_daily_notification_digest(
    request: Request,
    session: DbSession,
    settings: AppSettings,
) -> dict[str, int]:
    expected_secret = (
        settings.cron_secret.get_secret_value() if settings.cron_secret else ""
    )
    if not expected_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cron-ul de notificari nu este configurat.",
        )

    provided_secret = request.headers.get("x-cron-secret", "")
    if not provided_secret:
        authorization = request.headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            provided_secret = authorization[len("Bearer ") :]

    if not hmac.compare_digest(provided_secret, expected_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Secret cron invalid.",
        )

    service = NotificationService(session, settings)
    sent_count = await service.run_daily_digest()

    # Account alerts ride the same daily trigger but are sent on their own:
    # "you cannot generate anything until October" is useless if it waits for a
    # study digest the user may have opted out of.
    alerts = UsageAlertService(session, settings)
    alert_count = await alerts.run_for_all_users()
    await session.commit()

    return {"emails_sent": sent_count, "alerts_sent": alert_count}

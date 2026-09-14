from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserSubscription
from app.services.stripe_payments import ACTIVE_SUBSCRIPTION_STATUSES


def current_month_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    current = now or datetime.now(UTC)
    month_start = current.replace(
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    if month_start.month == 12:
        next_month_start = month_start.replace(
            year=month_start.year + 1,
            month=1,
        )
    else:
        next_month_start = month_start.replace(month=month_start.month + 1)
    return month_start, next_month_start


async def current_billing_window(
    session: AsyncSession,
    user: User,
) -> tuple[datetime, datetime]:
    subscription = await session.scalar(
        select(UserSubscription)
        .where(
            UserSubscription.user_id == user.id,
            UserSubscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
            UserSubscription.current_period_start.is_not(None),
            UserSubscription.current_period_end.is_not(None),
        )
        .order_by(
            UserSubscription.created_at.desc(),
            UserSubscription.updated_at.desc(),
        )
        .limit(1)
    )
    if (
        subscription is not None
        and subscription.current_period_start is not None
        and subscription.current_period_end is not None
    ):
        window = (
            subscription.current_period_start,
            subscription.current_period_end,
        )
    else:
        window = current_month_window()

    return _apply_usage_reset(window, user)


def _apply_usage_reset(
    window: tuple[datetime, datetime],
    user: User,
) -> tuple[datetime, datetime]:
    """Honour an admin reset by moving the window start forward.

    Usage is not stored as counters: every figure is derived by counting rows
    inside this window, so starting it later is what "reset the limits" means.

    The start only ever moves forward, never past the end. That is also what
    makes the reset expire by itself: once the next billing cycle opens, its
    own start is more recent than the reset, so the stored timestamp quietly
    stops having any effect and nothing needs to clean it up.
    """
    reset_at = getattr(user, "usage_reset_at", None)
    if reset_at is None:
        return window

    window_start, window_end = window
    if reset_at <= window_start or reset_at >= window_end:
        return window

    return reset_at, window_end

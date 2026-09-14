from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    PURCHASE_PAID,
    AddonPurchase,
    User,
    UserSubscription,
)
from app.services.billing_window import current_month_window
from app.services.subscription_status import ACTIVE_SUBSCRIPTION_STATUSES


@dataclass(frozen=True, slots=True)
class AddonBalance:
    """Extra capacity a user has paid for in the current cycle."""

    projects: int = 0
    materials: int = 0
    pages: int = 0
    ai_credits: int = 0
    ocr_pages: int = 0

    @property
    def is_empty(self) -> bool:
        return not any(
            (
                self.projects,
                self.materials,
                self.pages,
                self.ai_credits,
                self.ocr_pages,
            )
        )


EMPTY_BALANCE = AddonBalance()


async def billing_cycle_window(
    session: AsyncSession,
    user: User,
) -> tuple[datetime, datetime]:
    """The real billing period, ignoring any admin usage reset.

    Deliberately not current_billing_window(): that one honours the admin
    reset by moving the window start forward, and packs must not be affected
    by it. A reset performed after a purchase would otherwise push the
    purchase outside the window and silently void capacity the customer paid
    for.
    """
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
        return subscription.current_period_start, subscription.current_period_end

    return current_month_window()


async def addon_balance_for(
    session: AsyncSession,
    user: User,
) -> AddonBalance:
    """Everything bought for the cycle that covers this moment.

    Packs expire with the cycle, so there is no ledger to debit: the sum of
    what was bought simply raises the limits, and usage keeps being counted
    the way it always was.

    The cycle each pack was sold for is stored on the purchase, so asking
    whether now falls inside it is the whole test - no need to resolve the
    user's current window first. That keeps this to a single indexed
    aggregate, which matters because it runs on every authenticated request.
    """
    now = datetime.now(UTC)

    row = (
        await session.execute(
            select(
                func.coalesce(func.sum(AddonPurchase.extra_projects), 0),
                func.coalesce(func.sum(AddonPurchase.extra_materials), 0),
                func.coalesce(func.sum(AddonPurchase.extra_pages), 0),
                func.coalesce(func.sum(AddonPurchase.extra_ai_credits), 0),
                func.coalesce(func.sum(AddonPurchase.extra_ocr_pages), 0),
            ).where(
                AddonPurchase.user_id == user.id,
                # Orders are written before the redirect to Stripe, so an
                # abandoned checkout leaves a row behind. Only paid ones grant
                # anything.
                AddonPurchase.status == PURCHASE_PAID,
                AddonPurchase.cycle_start <= now,
                AddonPurchase.cycle_end > now,
            )
        )
    ).one()

    return AddonBalance(
        projects=int(row[0] or 0),
        materials=int(row[1] or 0),
        pages=int(row[2] or 0),
        ai_credits=int(row[3] or 0),
        ocr_pages=int(row[4] or 0),
    )


def attach_addon_balance(user: User, balance: AddonBalance) -> None:
    """Hang the balance on the user so sync limit code can read it.

    limits_for_user() and the AI credit helpers are synchronous and take only
    a user, exactly like they do for current_plan. Loading the balance up
    front keeps them that way.
    """
    user.addon_balance = balance  # type: ignore[attr-defined]


def balance_of(user: User) -> AddonBalance:
    """The balance attached to a user, or nothing.

    Falling back to an empty balance is the safe direction: a caller that
    forgot to load it sees the plan's own limits rather than capacity nobody
    paid for.
    """
    balance = getattr(user, "addon_balance", None)
    return balance if isinstance(balance, AddonBalance) else EMPTY_BALANCE

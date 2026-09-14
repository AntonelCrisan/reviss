from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.i18n import normalize_language, t
from app.models import (
    Notification,
    StudyProject,
    StudyProjectFile,
    SubscriptionPlan,
    User,
    UserSubscription,
)
from app.services.addons import addon_balance_for, attach_addon_balance
from app.services.ai_credits import (
    AiCreditsService,
    monthly_ai_credits,
    monthly_ocr_pages,
)
from app.services.billing_window import current_billing_window
from app.services.email import (
    EmailDeliveryError,
    EmailMessage,
    EmailService,
    email_logo_html,
    subscription_expiring_email,
    usage_alert_email,
)
from app.services.projects import limits_for_user
from app.services.subscription_status import ACTIVE_SUBSCRIPTION_STATUSES

logger = logging.getLogger("revizzio.usage_alerts")

# Warn once here, then again only when the allowance is actually gone. A single
# threshold would either arrive too late to act on, or nag from halfway.
WARNING_THRESHOLD: Final = 0.8

# How many days before the end an expiring subscription is announced.
EXPIRY_NOTICE_DAYS: Final[tuple[int, ...]] = (7, 3)


@dataclass(frozen=True, slots=True)
class UsageMetric:
    """One allowance, with the words the message needs to describe it."""

    key: str
    resource_label: str
    unit_label: str
    used: int
    limit: int

    @property
    def ratio(self) -> float:
        return self.used / self.limit if self.limit > 0 else 0.0

    @property
    def percent(self) -> int:
        return min(100, int(self.ratio * 100))

    @property
    def is_reached(self) -> bool:
        return self.limit > 0 and self.used >= self.limit

    @property
    def needs_warning(self) -> bool:
        return self.limit > 0 and WARNING_THRESHOLD <= self.ratio < 1.0


def _format_date(value: datetime, language: str) -> str:
    months = {
        "ro": (
            "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
            "iulie", "august", "septembrie", "octombrie", "noiembrie",
            "decembrie",
        ),
        "en": (
            "January", "February", "March", "April", "May", "June", "July",
            "August", "September", "October", "November", "December",
        ),
        "fr": (
            "janvier", "février", "mars", "avril", "mai", "juin", "juillet",
            "août", "septembre", "octobre", "novembre", "décembre",
        ),
    }
    names = months.get(language, months["ro"])
    return f"{value.day} {names[value.month - 1]} {value.year}"


class UsageAlertService:
    """Tells a user when an allowance is running out, or a plan is ending.

    Both are account matters rather than study nudges, so they are sent on
    their own rather than folded into the daily digest: "you cannot generate
    anything until October" is useless if it waits for a batch the user has
    opted out of.
    """

    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self._session = session
        self._settings = settings
        self._email = EmailService(settings)

    async def run_for_all_users(self) -> int:
        """Raise every alert due right now. Returns how many were sent."""
        # current_plan has to come along: limits_for_user reads it, and a lazy
        # load from this async context raises rather than fetching.
        users = list(
            (
                await self._session.scalars(
                    select(User)
                    .options(selectinload(User.current_plan))
                    .where(User.is_active.is_(True))
                )
            ).all()
        )

        sent = 0
        for user in users:
            # One broken account must not silence everybody else's alerts.
            # limits_for_user() refuses a user with no plan, which is a state
            # the schema allows, so this is a question of when and not if.
            #
            # The savepoint is what keeps the run going: without it a failed
            # user leaves the transaction unusable and the alerts already
            # written for earlier users could never be committed.
            try:
                async with self._session.begin_nested():
                    sent += await self.run_for_user(user)
            except Exception:
                logger.exception("Usage alerts failed for user %s", user.id)
        return sent

    async def run_for_user(self, user: User) -> int:
        sent = 0
        sent += await self._check_usage(user)
        sent += await self._check_expiry(user)
        return sent

    # --- usage --------------------------------------------------------------

    async def _collect_metrics(self, user: User) -> tuple[list[UsageMetric], datetime]:
        window_start, window_end = await current_billing_window(self._session, user)
        language = normalize_language(user.language_preference)

        projects_used = await self._session.scalar(
            select(func.count(StudyProject.id)).where(
                StudyProject.user_id == user.id,
                StudyProject.created_at >= window_start,
                StudyProject.created_at < window_end,
            )
        )
        materials_used = await self._session.scalar(
            select(func.count(StudyProjectFile.id))
            .join(StudyProject)
            .where(
                StudyProject.user_id == user.id,
                StudyProjectFile.created_at >= window_start,
                StudyProjectFile.created_at < window_end,
            )
        )

        credits = AiCreditsService(self._session)
        ai_used = await credits.credits_used_this_cycle(user, window_start, window_end)
        ocr_used = await credits.ocr_pages_used_this_cycle(
            user,
            window_start,
            window_end,
        )

        limits = limits_for_user(user)
        labels = {
            "projects": (
                t("usage.resource.projects", language),
                t("usage.unit.projects", language),
            ),
            "materials": (
                t("usage.resource.materials", language),
                t("usage.unit.materials", language),
            ),
            "ai_credits": (
                t("usage.resource.ai_credits", language),
                t("usage.unit.ai_credits", language),
            ),
            "ocr_pages": (
                t("usage.resource.ocr_pages", language),
                t("usage.unit.ocr_pages", language),
            ),
        }

        metrics = [
            UsageMetric(
                "projects",
                *labels["projects"],
                int(projects_used or 0),
                limits.active_projects,
            ),
            UsageMetric(
                "materials",
                *labels["materials"],
                int(materials_used or 0),
                limits.monthly_materials,
            ),
            UsageMetric(
                "ai_credits",
                *labels["ai_credits"],
                ai_used,
                monthly_ai_credits(user),
            ),
            UsageMetric(
                "ocr_pages",
                *labels["ocr_pages"],
                ocr_used,
                monthly_ocr_pages(user),
            ),
        ]
        return metrics, window_end

    async def _check_usage(self, user: User) -> int:
        # Bought capacity raises the limits, so the balance has to be loaded or
        # someone who just topped up would be warned about a limit they lifted.
        attach_addon_balance(user, await addon_balance_for(self._session, user))

        metrics, window_end = await self._collect_metrics(user)
        language = normalize_language(user.language_preference)
        reset_label = _format_date(window_end, language)
        cycle_stamp = window_end.date().isoformat()

        sent = 0
        for metric in metrics:
            if metric.is_reached:
                stage = "reached"
            elif metric.needs_warning:
                stage = "warning"
            else:
                continue

            # One per metric, per stage, per cycle. Crossing 80% and later 100%
            # are two separate pieces of news; crossing the same one twice is
            # not.
            key = f"usage:{metric.key}:{stage}:{cycle_stamp}"
            title = t(
                f"notify.usage_{stage}.title",
                language,
                percent=metric.percent,
                resource=metric.resource_label,
            )
            body = t(
                f"notify.usage_{stage}.body",
                language,
                percent=metric.percent,
                resource=metric.resource_label,
                unit=metric.unit_label,
                used=metric.used,
                limit=metric.limit,
                remaining=max(metric.limit - metric.used, 0),
                reset_date=reset_label,
            )

            if not await self._record(user, "usage_limit", key, title, body):
                continue

            html, text = usage_alert_email(
                resource_label=metric.resource_label,
                unit_label=metric.unit_label,
                used=metric.used,
                limit=metric.limit,
                percent=metric.percent,
                reset_date_label=reset_label,
                account_url=f"{self._settings.public_app_url}/myaccount",
                is_reached=metric.is_reached,
                logo_html=email_logo_html(
                    self._settings.email_logo_url,
                    app_name="Reviss",
                ),
                app_name="Reviss",
                language=language,
            )
            subject = t(
                f"email.usage_alert.subject_{stage}",
                language,
                percent=metric.percent,
                resource=metric.resource_label,
            )
            if await self._send(user, subject, html, text):
                sent += 1
        return sent

    # --- expiry -------------------------------------------------------------

    async def _check_expiry(self, user: User) -> int:
        subscription = await self._session.scalar(
            select(UserSubscription)
            .where(
                UserSubscription.user_id == user.id,
                UserSubscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
                # Only a cancelled subscription actually ends. An auto-renewing
                # one is not expiring, and saying so would be alarming and wrong.
                UserSubscription.cancel_at_period_end.is_(True),
                UserSubscription.current_period_end.is_not(None),
            )
            .order_by(UserSubscription.current_period_end.asc())
            .limit(1)
        )
        if subscription is None or subscription.current_period_end is None:
            return 0

        end = subscription.current_period_end
        days_left = (end.date() - datetime.now(UTC).date()).days
        if days_left not in EXPIRY_NOTICE_DAYS:
            return 0

        plan = await self._session.get(SubscriptionPlan, subscription.plan_id)
        plan_name = plan.name if plan is not None else "Reviss"
        language = normalize_language(user.language_preference)
        end_label = _format_date(end, language)

        key = f"expiry:{subscription.id}:{days_left}"
        title = t(
            "notify.subscription_expiring.title",
            language,
            plan=plan_name,
            days=days_left,
        )
        body = t(
            "notify.subscription_expiring.body",
            language,
            end_date=end_label,
        )
        if not await self._record(user, "subscription_expiring", key, title, body):
            return 0

        html, text = subscription_expiring_email(
            plan_name=plan_name,
            end_date_label=end_label,
            days_left=days_left,
            account_url=f"{self._settings.public_app_url}/upgrade",
            logo_html=email_logo_html(
                self._settings.email_logo_url,
                app_name="Reviss",
            ),
            app_name="Reviss",
            language=language,
        )
        subject = t(
            "email.subscription_expiring.subject",
            language,
            days=days_left,
        )
        return 1 if await self._send(user, subject, html, text) else 0

    # --- plumbing -----------------------------------------------------------

    async def _record(
        self,
        user: User,
        notification_type: str,
        dedupe_key: str,
        title: str,
        body: str,
    ) -> bool:
        """Write the in-app notification, or report that it already exists.

        The unique index is what actually guarantees one message: two cron runs
        overlapping would otherwise both pass a plain existence check.

        The insert runs inside a savepoint so a duplicate only undoes itself.
        A plain rollback here would discard every notification already written
        earlier in the same run, for every user processed so far.
        """
        try:
            async with self._session.begin_nested():
                self._session.add(
                    Notification(
                        user_id=user.id,
                        type=notification_type,
                        dedupe_key=dedupe_key,
                        title=title,
                        body=body,
                    )
                )
        except IntegrityError:
            return False
        return True

    async def _send(self, user: User, subject: str, html: str, text: str) -> bool:
        try:
            await self._email.send(
                EmailMessage(to=user.email, subject=subject, html=html, text=text)
            )
        except EmailDeliveryError:
            # The in-app notification already landed, so the user is not left
            # unaware; a failed email must not abort the rest of the run.
            return False
        return True

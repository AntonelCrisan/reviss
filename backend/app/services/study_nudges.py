"""Nudges for accounts that signed up and then did nothing.

The inactivity reminder measures from the last day of study, so an account
that never studied has nothing to measure from and never hears back. These
nudges cover exactly that: someone who made an account and stopped, and
someone whose project was generated but never opened to study.

They go out on their own daily run (the morning cron), keep their own switch
in Settings, and carry an unsubscribe link, because an email nobody can stop
is the one that gets reported as spam.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.i18n import normalize_language, t
from app.core.security import unsubscribe_token
from app.models import (
    Notification,
    StudyProject,
    StudyProjectFlashcard,
    StudyProjectQuiz,
    StudyProjectStrategy,
    StudyProjectSummaryHighlight,
    StudyProjectSummaryNote,
    User,
)
from app.services.email import (
    EmailDeliveryError,
    EmailMessage,
    EmailService,
    email_logo_html,
    study_nudge_email,
)
from app.services.preferences import PreferencesService

logger = logging.getLogger("revizzio.study_nudges")

# The first nudge waits three days: a day after signing up is still the same
# session for most people, and reads as pestering.
NUDGE_FIRST_DAYS = 3
NUDGE_SECOND_DAYS = 10
# After the first two, once a fortnight for as long as nothing happens.
NUDGE_REPEAT_DAYS = 14
# Never twice in the same breath as another Reviss email.
NUDGE_QUIET_HOURS = 12
# How many rotating closing lines the repeats cycle through.
NUDGE_TIP_COUNT = 3


def _project_child_exists(model: type, column=None):
    """EXISTS over a table hanging off a project, for the current user."""
    statement = (
        select(1)
        .select_from(model)
        .join(StudyProject, StudyProject.id == model.project_id)
        .where(StudyProject.user_id == User.id)
    )
    if column is not None:
        statement = statement.where(column)
    return statement.exists()


def _has_studied_clause():
    """Any sign the student actually worked, not just generated something.

    Opening the app is not studying: highlighting a passage, marking a card
    for review, ticking a step of the route, creating a quiz or taking one
    are.
    """
    return (
        _project_child_exists(StudyProjectSummaryHighlight)
        | _project_child_exists(StudyProjectSummaryNote)
        | _project_child_exists(
            StudyProjectFlashcard, StudyProjectFlashcard.review.is_(True)
        )
        | _project_child_exists(
            StudyProjectStrategy, StudyProjectStrategy.completed_at.is_not(None)
        )
        # An attempt cannot exist without a quiz, so the quiz covers both.
        | _project_child_exists(StudyProjectQuiz)
    )


class StudyNudgeService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self._session = session
        self._settings = settings

    async def run_for_all_users(self) -> int:
        """Send today's nudges. Returns how many emails went out."""
        now = datetime.now(UTC)
        rows = (
            await self._session.execute(
                select(
                    User,
                    select(1)
                    .where(StudyProject.user_id == User.id)
                    .exists()
                    .label("has_project"),
                    _has_studied_clause().label("has_studied"),
                )
                .where(
                    User.is_active.is_(True),
                    User.created_at <= now - timedelta(days=NUDGE_FIRST_DAYS),
                )
                .order_by(User.created_at)
            )
        ).all()

        sent = 0
        for user, has_project, has_studied in rows:
            if has_studied:
                continue
            try:
                if await self._nudge_user(user, bool(has_project), now):
                    sent += 1
            except EmailDeliveryError as exc:
                logger.warning("Nudge-ul pentru %s nu a plecat: %s", user.id, exc)
            except Exception:
                logger.exception("Nudge-ul pentru %s a esuat.", user.id)

        await self._session.commit()
        return sent

    async def _nudge_user(self, user: User, has_project: bool, now: datetime) -> bool:
        study_preferences = await PreferencesService(self._session).get(user)
        preferences = study_preferences.preferences
        if not preferences.notify_tips_reminders:
            return False

        sent_before, last_sent_at = (
            await self._session.execute(
                select(
                    func.count(Notification.id),
                    func.max(Notification.created_at),
                ).where(
                    Notification.user_id == user.id,
                    Notification.type == "study_nudge",
                )
            )
        ).one()

        if not self._is_due(user, sent_before, last_sent_at, now):
            return False
        if await self._emailed_recently(user, now):
            return False

        branch = "resume" if has_project else "start"
        step = ("first", "second")[sent_before] if sent_before < 2 else "repeat"
        language = normalize_language(user.language_preference)
        project_id = await self._project_to_open(user) if has_project else None

        notification = Notification(
            user_id=user.id,
            type="study_nudge",
            dedupe_key=f"study_nudge:{sent_before + 1}",
            title=t(f"notification.study_nudge.{branch}.title", language),
            body=t(f"notification.study_nudge.{branch}.body", language),
            project_id=project_id,
        )
        self._session.add(notification)
        await self._session.flush()

        if not preferences.notify_email_enabled:
            # The bell still shows it; only the email is off.
            return False

        await self._send_email(
            user=user,
            branch=branch,
            step=step,
            sent_before=sent_before,
            project_id=project_id,
            language=language,
        )
        notification.emailed_at = now
        return True

    def _is_due(
        self,
        user: User,
        sent_before: int,
        last_sent_at: datetime | None,
        now: datetime,
    ) -> bool:
        if sent_before == 0:
            return user.created_at <= now - timedelta(days=NUDGE_FIRST_DAYS)
        if last_sent_at is None:
            return False
        gap = timedelta(
            days=(
                NUDGE_SECOND_DAYS - NUDGE_FIRST_DAYS
                if sent_before == 1
                else NUDGE_REPEAT_DAYS
            )
        )
        return last_sent_at <= now - gap

    async def _emailed_recently(self, user: User, now: datetime) -> bool:
        recent = await self._session.scalar(
            select(Notification.id)
            .where(
                Notification.user_id == user.id,
                Notification.emailed_at.is_not(None),
                Notification.emailed_at >= now - timedelta(hours=NUDGE_QUIET_HOURS),
            )
            .limit(1)
        )
        return recent is not None

    async def _project_to_open(self, user: User) -> uuid.UUID | None:
        return await self._session.scalar(
            select(StudyProject.id)
            .where(StudyProject.user_id == user.id)
            .order_by(StudyProject.created_at.desc())
            .limit(1)
        )

    async def _send_email(
        self,
        *,
        user: User,
        branch: str,
        step: str,
        sent_before: int,
        project_id: uuid.UUID | None,
        language: str,
    ) -> None:
        app_url = self._settings.public_app_url.rstrip("/")
        action_url = (
            f"{app_url}/myaccount/rezumat?project={project_id}"
            if project_id is not None
            else f"{app_url}/myaccount"
        )
        token = unsubscribe_token(
            user.id, self._settings.session_secret.get_secret_value()
        )
        unsubscribe_url = f"{app_url}/dezabonare?token={token}"
        # The header link has to answer a POST, which a page cannot: mail
        # clients send one straight to it, without the reader opening the
        # message. The visible link in the body stays the page.
        one_click_url = f"{app_url}/api/auth/notifications/unsubscribe?token={token}"
        tip = (
            t(
                f"email.study_nudge.tip.{(sent_before - 2) % NUDGE_TIP_COUNT + 1}",
                language,
            )
            if step == "repeat"
            else None
        )

        subject, html, text = study_nudge_email(
            branch=branch,
            step=step,
            tip=tip,
            action_url=action_url,
            unsubscribe_url=unsubscribe_url,
            logo_html=email_logo_html(self._settings.email_logo_url, app_name="Reviss"),
            language=language,
        )
        await EmailService(self._settings).send(
            EmailMessage(
                to=user.email,
                subject=subject,
                html=html,
                text=text,
                # Mail clients show their own unsubscribe button for these, and
                # honour it without the reader ever opening the message.
                headers={
                    "List-Unsubscribe": f"<{one_click_url}>",
                    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
            )
        )

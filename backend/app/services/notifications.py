import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.i18n import normalize_language, plural_key, t
from app.models import (
    Notification,
    StudyProject,
    StudyProjectFlashcard,
    StudyProjectQuiz,
    StudyProjectQuizAttempt,
    User,
    UserPreferences,
)
from app.services.email import (
    EmailDeliveryError,
    EmailMessage,
    EmailService,
    email_logo_html,
    notification_digest_email,
)
from app.services.preferences import PreferencesService
from app.services.study_activity import (
    count_active_days_since,
    get_current_streak,
    get_last_activity_date,
)

NotificationType = Literal[
    "project_ready",
    "weak_concepts",
    "daily_review",
    "weekly_progress",
    "inactivity_reminder",
    "streak_milestone",
]

DAILY_DIGEST_CONCURRENCY = 5

INACTIVITY_REMINDER_THRESHOLD_DAYS = 3
INACTIVITY_REMINDER_COOLDOWN_DAYS = 7
STREAK_MILESTONES = (3, 7, 14, 30, 60, 100)


def _project_url(app_url: str, project_id: uuid.UUID | None) -> str | None:
    if project_id is None:
        return None
    return f"{app_url.rstrip('/')}/myaccount/rezumat?project={project_id}"


def _weekly_progress_closing_line(avg_score: int, language: str) -> str:
    if avg_score >= 80:
        return t("notification.weekly_progress.closing_high", language)
    if avg_score >= 50:
        return t("notification.weekly_progress.closing_mid", language)
    return t("notification.weekly_progress.closing_low", language)


class NotificationNotFoundError(Exception):
    pass


class NotificationService:
    def __init__(self, session: AsyncSession, settings: Settings | None = None) -> None:
        self._session = session
        self._settings = settings

    async def notify(
        self,
        user: User,
        *,
        type: NotificationType,
        title: str,
        body: str,
        project_id: uuid.UUID | None = None,
    ) -> Notification:
        notification = Notification(
            user_id=user.id,
            type=type,
            title=title,
            body=body,
            project_id=project_id,
        )
        self._session.add(notification)
        await self._session.commit()

        if self._settings is not None:
            await self._maybe_send_instant_email(user, notification)

        return notification

    async def list_for_user(
        self,
        user: User,
        *,
        unread_only: bool = False,
        limit: int = 20,
    ) -> list[Notification]:
        query = (
            select(Notification)
            .where(Notification.user_id == user.id)
            .options(selectinload(Notification.project))
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
        if unread_only:
            query = query.where(Notification.read_at.is_(None))

        result = await self._session.scalars(query)
        return list(result.all())

    async def unread_count(self, user: User) -> int:
        count = await self._session.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_id == user.id,
                Notification.read_at.is_(None),
            )
        )
        return int(count or 0)

    async def mark_read(self, user: User, notification_id: uuid.UUID) -> Notification:
        notification = await self._session.scalar(
            select(Notification)
            .where(
                Notification.id == notification_id,
                Notification.user_id == user.id,
            )
            .options(selectinload(Notification.project))
        )
        if notification is None:
            raise NotificationNotFoundError

        if notification.read_at is None:
            notification.read_at = datetime.now(UTC)
            await self._session.commit()
        return notification

    async def delete(self, user: User, notification_id: uuid.UUID) -> None:
        notification = await self._session.scalar(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user.id,
            )
        )
        if notification is None:
            raise NotificationNotFoundError

        await self._session.delete(notification)
        await self._session.commit()

    async def mark_all_read(self, user: User) -> int:
        notifications = list(
            (
                await self._session.scalars(
                    select(Notification).where(
                        Notification.user_id == user.id,
                        Notification.read_at.is_(None),
                    )
                )
            ).all()
        )
        now = datetime.now(UTC)
        for notification in notifications:
            notification.read_at = now

        await self._session.commit()
        return len(notifications)

    async def _maybe_send_instant_email(
        self,
        user: User,
        notification: Notification,
    ) -> None:
        assert self._settings is not None

        study_preferences = await PreferencesService(self._session).get(user)
        prefs = study_preferences.preferences
        if not prefs.notify_email_enabled or prefs.notify_frequency != "instant":
            return

        html, text = notification_digest_email(
            items=[
                (
                    notification.title,
                    notification.body,
                    _project_url(
                        self._settings.public_app_url, notification.project_id
                    ),
                )
            ],
            app_url=self._settings.public_app_url,
            logo_html=email_logo_html(self._settings.email_logo_url, app_name="Reviss"),
            language=normalize_language(user.language_preference),
        )
        try:
            await EmailService(self._settings).send(
                EmailMessage(
                    to=user.email,
                    subject=notification.title,
                    html=html,
                    text=text,
                )
            )
        except EmailDeliveryError:
            return

        notification.emailed_at = datetime.now(UTC)
        await self._session.commit()

    async def _maybe_create_daily_review_notification(
        self,
        user: User,
        now: datetime,
        preferences: UserPreferences,
    ) -> Notification | None:
        if not preferences.automation_daily_review:
            return None

        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        existing = await self._session.scalar(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.type == "daily_review",
                Notification.created_at >= day_start,
            )
        )
        if existing is not None:
            return None

        review_count = await self._session.scalar(
            select(func.count())
            .select_from(StudyProjectFlashcard)
            .join(StudyProject, StudyProject.id == StudyProjectFlashcard.project_id)
            .where(
                StudyProject.user_id == user.id,
                StudyProjectFlashcard.review.is_(True),
            )
        )
        review_count = int(review_count or 0)
        if review_count == 0:
            return None

        language = normalize_language(user.language_preference)
        notification = Notification(
            user_id=user.id,
            type="daily_review",
            title=t("notification.daily_review.title", language),
            body=t("notification.daily_review.body", language, count=review_count),
        )
        self._session.add(notification)
        await self._session.flush()
        return notification

    async def _maybe_create_weekly_progress_notification(
        self,
        user: User,
        now: datetime,
        preferences: UserPreferences,
    ) -> Notification | None:
        # There is no separate weekly scheduler — this only runs on the day
        # the daily cron happens to fall on Monday.
        if now.weekday() != 0:
            return None

        if not preferences.automation_weekly_progress:
            return None

        week_start = now - timedelta(days=7)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        existing = await self._session.scalar(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.type == "weekly_progress",
                Notification.created_at >= day_start,
            )
        )
        if existing is not None:
            return None

        quiz_count = await self._session.scalar(
            select(func.count())
            .select_from(StudyProjectQuizAttempt)
            .join(
                StudyProjectQuiz,
                StudyProjectQuiz.id == StudyProjectQuizAttempt.quiz_id,
            )
            .join(StudyProject, StudyProject.id == StudyProjectQuiz.project_id)
            .where(
                StudyProject.user_id == user.id,
                StudyProjectQuizAttempt.completed_at >= week_start,
            )
        )
        quiz_count = int(quiz_count or 0)

        avg_score = await self._session.scalar(
            select(func.avg(StudyProjectQuizAttempt.score_percent))
            .select_from(StudyProjectQuizAttempt)
            .join(
                StudyProjectQuiz,
                StudyProjectQuiz.id == StudyProjectQuizAttempt.quiz_id,
            )
            .join(StudyProject, StudyProject.id == StudyProjectQuiz.project_id)
            .where(
                StudyProject.user_id == user.id,
                StudyProjectQuizAttempt.completed_at >= week_start,
            )
        )

        active_days = await count_active_days_since(
            self._session, user.id, week_start.date()
        )

        if quiz_count == 0 and active_days == 0:
            return None

        language = normalize_language(user.language_preference)
        days_label = t(
            plural_key("notification.weekly_progress.days", active_days),
            language,
            count=active_days,
        )
        if quiz_count > 0:
            score = round(float(avg_score or 0))
            body = (
                t(
                    "notification.weekly_progress.body_quizzes",
                    language,
                    quizzes=t(
                        plural_key("notification.weekly_progress.quizzes", quiz_count),
                        language,
                        count=quiz_count,
                    ),
                    score=score,
                    days=days_label,
                    closing=_weekly_progress_closing_line(score, language),
                )
            )
        else:
            body = t(
                "notification.weekly_progress.body_days", language, days=days_label
            )

        notification = Notification(
            user_id=user.id,
            type="weekly_progress",
            title=t("notification.weekly_progress.title", language),
            body=body,
        )
        self._session.add(notification)
        await self._session.flush()
        return notification

    async def _maybe_create_inactivity_notification(
        self,
        user: User,
        now: datetime,
        preferences: UserPreferences,
    ) -> Notification | None:
        if not preferences.automation_inactivity_reminder:
            return None

        last_activity = await get_last_activity_date(self._session, user.id)
        if last_activity is None:
            return None

        days_inactive = (now.date() - last_activity).days
        if days_inactive < INACTIVITY_REMINDER_THRESHOLD_DAYS:
            return None

        recent_cutoff = now - timedelta(days=INACTIVITY_REMINDER_COOLDOWN_DAYS)
        existing = await self._session.scalar(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.type == "inactivity_reminder",
                Notification.created_at >= recent_cutoff,
            )
        )
        if existing is not None:
            return None

        language = normalize_language(user.language_preference)
        notification = Notification(
            user_id=user.id,
            type="inactivity_reminder",
            title=t("notification.inactivity.title", language),
            body=t("notification.inactivity.body", language, days=days_inactive),
        )
        self._session.add(notification)
        await self._session.flush()
        return notification

    async def _maybe_create_streak_milestone_notification(
        self,
        user: User,
        now: datetime,
        preferences: UserPreferences,
    ) -> Notification | None:
        if not preferences.notify_alert_streak_milestone:
            return None

        streak = await get_current_streak(self._session, user.id, today=now.date())
        if streak not in STREAK_MILESTONES:
            return None

        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        existing = await self._session.scalar(
            select(Notification).where(
                Notification.user_id == user.id,
                Notification.type == "streak_milestone",
                Notification.created_at >= day_start,
            )
        )
        if existing is not None:
            return None

        language = normalize_language(user.language_preference)
        notification = Notification(
            user_id=user.id,
            type="streak_milestone",
            title=t("notification.streak.title", language, days=streak),
            body=t("notification.streak.body", language, days=streak),
        )
        self._session.add(notification)
        await self._session.flush()
        return notification

    async def run_daily_digest(self) -> int:
        if self._settings is None:
            raise ValueError(
                "NotificationService are nevoie de settings pentru digest-ul zilnic."
            )
        settings = self._settings
        now = datetime.now(UTC)

        # Every active user is considered here, regardless of their email
        # preferences — these notifications (daily_review, weekly_progress,
        # inactivity_reminder, streak_milestone) must exist in-app (the bell
        # shows any Notification row for the user, independent of
        # emailed_at) even for users on "instant" frequency or with email
        # disabled. Only the email-batching step below is restricted to
        # users actually opted into a daily email digest.
        users = list(
            (
                await self._session.scalars(
                    select(User).where(User.is_active.is_(True))
                )
            ).all()
        )

        pending_by_user: dict[uuid.UUID, list[Notification]] = {}
        email_eligible_user_ids: set[uuid.UUID] = set()
        for user in users:
            notifications = list(
                (
                    await self._session.scalars(
                        select(Notification)
                        .where(
                            Notification.user_id == user.id,
                            Notification.emailed_at.is_(None),
                        )
                        .order_by(Notification.created_at.asc())
                    )
                ).all()
            )

            # Fetched once and reused across all four generators below,
            # instead of each one independently fetching (and committing)
            # the same preferences row.
            study_preferences = await PreferencesService(self._session).get(user)
            preferences = study_preferences.preferences

            daily_review = await self._maybe_create_daily_review_notification(
                user, now, preferences
            )
            if daily_review is not None:
                notifications.append(daily_review)

            weekly_progress = await self._maybe_create_weekly_progress_notification(
                user, now, preferences
            )
            if weekly_progress is not None:
                notifications.append(weekly_progress)

            inactivity_reminder = await self._maybe_create_inactivity_notification(
                user, now, preferences
            )
            if inactivity_reminder is not None:
                notifications.append(inactivity_reminder)

            streak_milestone = (
                await self._maybe_create_streak_milestone_notification(
                    user, now, preferences
                )
            )
            if streak_milestone is not None:
                notifications.append(streak_milestone)

            if notifications:
                pending_by_user[user.id] = notifications
                if (
                    preferences.notify_frequency == "daily"
                    and preferences.notify_email_enabled
                ):
                    email_eligible_user_ids.add(user.id)

        if not any(
            user_id in email_eligible_user_ids for user_id in pending_by_user
        ):
            await self._session.commit()
            return 0

        users_by_id = {user.id: user for user in users}
        email_service = EmailService(settings)
        semaphore = asyncio.Semaphore(DAILY_DIGEST_CONCURRENCY)
        logo_html = email_logo_html(settings.email_logo_url, app_name="Reviss")

        async def send_for_user(user_id: uuid.UUID) -> tuple[uuid.UUID, bool]:
            async with semaphore:
                user = users_by_id[user_id]
                notifications = pending_by_user[user_id]
                items = [
                    (
                        item.title,
                        item.body,
                        _project_url(settings.public_app_url, item.project_id),
                    )
                    for item in notifications
                ]
                language = normalize_language(user.language_preference)
                html, text = notification_digest_email(
                    items=items,
                    app_url=settings.public_app_url,
                    logo_html=logo_html,
                    language=language,
                )
                subject = (
                    notifications[0].title
                    if len(notifications) == 1
                    else t(
                        "email.digest.subject_many",
                        language,
                        count=len(notifications),
                    )
                )
                try:
                    await email_service.send(
                        EmailMessage(
                            to=user.email,
                            subject=subject,
                            html=html,
                            text=text,
                        )
                    )
                    return user_id, True
                except EmailDeliveryError:
                    return user_id, False

        results = await asyncio.gather(
            *(send_for_user(user_id) for user_id in email_eligible_user_ids)
        )

        sent_count = 0
        emailed_at = datetime.now(UTC)
        for user_id, success in results:
            if not success:
                continue
            sent_count += 1
            for notification in pending_by_user[user_id]:
                notification.emailed_at = emailed_at

        await self._session.commit()
        return sent_count

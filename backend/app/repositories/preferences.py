import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserPreferences


class UserPreferencesRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_user_id(self, user_id: uuid.UUID) -> UserPreferences | None:
        return await self._session.scalar(
            select(UserPreferences).where(UserPreferences.user_id == user_id)
        )

    async def get_or_create(self, user_id: uuid.UUID) -> UserPreferences:
        preferences = await self.get_by_user_id(user_id)
        if preferences is not None:
            return preferences

        preferences = UserPreferences(user_id=user_id)
        self._session.add(preferences)
        try:
            await self._session.flush()
        except IntegrityError:
            # Another concurrent request created the row first (user_id is
            # unique) — fall back to reading it instead of failing.
            await self._session.rollback()
            preferences = await self.get_by_user_id(user_id)
            if preferences is None:
                raise
        return preferences

    async def update(
        self,
        preferences: UserPreferences,
        *,
        study_pace: str | None = None,
        ai_feedback_style: str | None = None,
        automation_daily_review: bool | None = None,
        automation_weak_concept_alerts: bool | None = None,
        notify_email_enabled: bool | None = None,
        notify_alert_project_ready: bool | None = None,
        notify_alert_billing: bool | None = None,
        automation_weekly_progress: bool | None = None,
        automation_inactivity_reminder: bool | None = None,
        notify_tips_reminders: bool | None = None,
        notify_alert_streak_milestone: bool | None = None,
        notify_frequency: str | None = None,
    ) -> UserPreferences:
        if study_pace is not None:
            preferences.study_pace = study_pace
        if ai_feedback_style is not None:
            preferences.ai_feedback_style = ai_feedback_style
        if automation_daily_review is not None:
            preferences.automation_daily_review = automation_daily_review
        if automation_weak_concept_alerts is not None:
            preferences.automation_weak_concept_alerts = (
                automation_weak_concept_alerts
            )
        if notify_email_enabled is not None:
            preferences.notify_email_enabled = notify_email_enabled
        if notify_alert_project_ready is not None:
            preferences.notify_alert_project_ready = notify_alert_project_ready
        if notify_alert_billing is not None:
            preferences.notify_alert_billing = notify_alert_billing
        if automation_weekly_progress is not None:
            preferences.automation_weekly_progress = automation_weekly_progress
        if automation_inactivity_reminder is not None:
            preferences.automation_inactivity_reminder = (
                automation_inactivity_reminder
            )
        if notify_tips_reminders is not None:
            preferences.notify_tips_reminders = notify_tips_reminders
        if notify_alert_streak_milestone is not None:
            preferences.notify_alert_streak_milestone = (
                notify_alert_streak_milestone
            )
        if notify_frequency is not None:
            preferences.notify_frequency = notify_frequency

        await self._session.flush()
        return preferences

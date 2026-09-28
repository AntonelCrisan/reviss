from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserPreferences
from app.repositories.preferences import UserPreferencesRepository
from app.services.audit import add_audit_log


@dataclass(frozen=True)
class StudyPreferences:
    preferences: UserPreferences
    newsletter_consent: bool


class PreferencesService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._preferences = UserPreferencesRepository(session)

    async def get(self, user: User) -> StudyPreferences:
        preferences = await self._preferences.get_or_create(user.id)
        await self._session.commit()
        return StudyPreferences(
            preferences=preferences,
            newsletter_consent=user.newsletter_consent,
        )

    async def update(
        self,
        user: User,
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
        newsletter_consent: bool | None = None,
    ) -> StudyPreferences:
        preferences = await self._preferences.get_or_create(user.id)
        preferences = await self._preferences.update(
            preferences,
            study_pace=study_pace,
            ai_feedback_style=ai_feedback_style,
            automation_daily_review=automation_daily_review,
            automation_weak_concept_alerts=automation_weak_concept_alerts,
            notify_email_enabled=notify_email_enabled,
            notify_alert_project_ready=notify_alert_project_ready,
            notify_alert_billing=notify_alert_billing,
            automation_weekly_progress=automation_weekly_progress,
            automation_inactivity_reminder=automation_inactivity_reminder,
            notify_tips_reminders=notify_tips_reminders,
            notify_alert_streak_milestone=notify_alert_streak_milestone,
            notify_frequency=notify_frequency,
        )
        if newsletter_consent is not None:
            user.newsletter_consent = newsletter_consent

        add_audit_log(
            self._session,
            action="user.study_preferences.updated",
            actor=user,
            resource_type="user_preferences",
            resource_id=str(preferences.id),
            details={
                "study_pace": study_pace,
                "ai_feedback_style": ai_feedback_style,
                "automation_daily_review": automation_daily_review,
                "automation_weak_concept_alerts": automation_weak_concept_alerts,
                "notify_email_enabled": notify_email_enabled,
                "notify_alert_project_ready": notify_alert_project_ready,
                "notify_alert_billing": notify_alert_billing,
                "automation_weekly_progress": automation_weekly_progress,
                "automation_inactivity_reminder": automation_inactivity_reminder,
                "notify_tips_reminders": notify_tips_reminders,
                "notify_alert_streak_milestone": notify_alert_streak_milestone,
                "notify_frequency": notify_frequency,
                "newsletter_consent": newsletter_consent,
            },
        )
        await self._session.commit()
        return StudyPreferences(
            preferences=preferences,
            newsletter_consent=user.newsletter_consent,
        )

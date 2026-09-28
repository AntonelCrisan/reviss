from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

StudyPace = Literal["light", "balanced", "exam"]
AiFeedbackStyle = Literal["short", "guided", "exam"]
NotifyFrequency = Literal["instant", "daily"]


class StudyPreferencesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    study_pace: StudyPace
    ai_feedback_style: AiFeedbackStyle
    automation_daily_review: bool
    automation_weak_concept_alerts: bool
    notify_email_enabled: bool
    notify_alert_project_ready: bool
    notify_alert_billing: bool
    automation_weekly_progress: bool
    automation_inactivity_reminder: bool
    notify_tips_reminders: bool = True
    notify_alert_streak_milestone: bool
    notify_frequency: NotifyFrequency
    newsletter_consent: bool = False


class StudyPreferencesUpdate(BaseModel):
    study_pace: StudyPace | None = None
    ai_feedback_style: AiFeedbackStyle | None = None
    automation_daily_review: bool | None = None
    automation_weak_concept_alerts: bool | None = None
    notify_email_enabled: bool | None = None
    notify_alert_project_ready: bool | None = None
    notify_alert_billing: bool | None = None
    automation_weekly_progress: bool | None = None
    automation_inactivity_reminder: bool | None = None
    notify_tips_reminders: bool | None = None
    notify_alert_streak_milestone: bool | None = None
    notify_frequency: NotifyFrequency | None = None
    newsletter_consent: bool | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> StudyPreferencesUpdate:
        if not self.model_dump(exclude_unset=True):
            raise ValueError("Trimite cel putin o preferinta de actualizat.")
        return self

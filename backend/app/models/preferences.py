import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserPreferences(Base):
    __tablename__ = "user_preferences"
    __table_args__ = (
        CheckConstraint(
            "study_pace IN ('light', 'balanced', 'exam')",
            name="ck_user_preferences_study_pace",
        ),
        CheckConstraint(
            "ai_feedback_style IN ('short', 'guided', 'exam')",
            name="ck_user_preferences_ai_feedback_style",
        ),
        CheckConstraint(
            "notify_frequency IN ('instant', 'daily')",
            name="ck_user_preferences_notify_frequency",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    study_pace: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="balanced",
        server_default="balanced",
    )
    ai_feedback_style: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="guided",
        server_default="guided",
    )
    automation_daily_review: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    automation_weak_concept_alerts: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    notify_email_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    notify_alert_project_ready: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    notify_alert_billing: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    automation_weekly_progress: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    automation_inactivity_reminder: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    # Getting-started and come-back emails. Separate from the inactivity
    # reminder: someone who studies may still not want us nudging them.
    notify_tips_reminders: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    notify_alert_streak_milestone: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    notify_frequency: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="daily",
        server_default="daily",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

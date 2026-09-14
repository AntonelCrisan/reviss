import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.study_project import StudyProject


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        # Mirrors NotificationType. Adding a type in Python alone is not
        # enough: the database refuses the insert and the notification simply
        # never appears.
        CheckConstraint(
            "type IN ('project_ready', 'weak_concepts', 'daily_review', "
            "'weekly_progress', 'inactivity_reminder', 'streak_milestone', "
            "'usage_limit', 'subscription_expiring')",
            name="ck_notifications_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    # Composed by whoever raises the notification to say exactly what it is
    # about - a metric at a threshold in a cycle, say - so the same one is
    # never sent twice. Left null by the generators that dedupe on a time
    # window instead.
    dedupe_key: Mapped[str | None] = mapped_column(String(160), nullable=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("study_projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    project: Mapped[StudyProject | None] = relationship()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    emailed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

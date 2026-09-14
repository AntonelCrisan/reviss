import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.auth_session import AuthSession
    from app.models.study_project import StudyProject, StudyProjectArchive
    from app.models.subscription import SubscriptionPlan, UserSubscription


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "theme_preference IN ('light', 'dark', 'system')",
            name="ck_users_theme_preference",
        ),
        CheckConstraint(
            "language_preference IN ('ro', 'en', 'fr')",
            name="ck_users_language_preference",
        ),
        CheckConstraint(
            "role IN ('admin', 'user')",
            name="ck_users_role",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        unique=True,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    role: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="user",
        server_default="user",
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
    terms_accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    terms_version: Mapped[str] = mapped_column(String(32), nullable=False)
    newsletter_consent: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    newsletter_consent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    theme_preference: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="system",
        server_default="system",
    )
    language_preference: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="ro",
        server_default="ro",
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
        unique=True,
        index=True,
    )
    current_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscription_plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Set by an admin to start this account's usage cycle over. It only ever
    # moves the window start forward, so the next real billing cycle overtakes
    # it and it stops mattering on its own -- nothing has to clear it.
    usage_reset_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    sessions: Mapped[list[AuthSession]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    current_plan: Mapped[SubscriptionPlan | None] = relationship(
        foreign_keys=[current_plan_id],
    )
    subscriptions: Mapped[list[UserSubscription]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    study_projects: Mapped[list[StudyProject]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    study_project_archives: Mapped[list[StudyProjectArchive]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Final

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


# The free plan every account starts on. Entitlement checks read
# ``User.current_plan`` and refuse to invent limits when it is missing, so a
# freshly registered account has to be put on this plan right away.
FREE_PLAN_SLUG: Final[str] = "start"


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
        unique=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    price_ron: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    old_price_ron: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )
    discount_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    billing_interval: Mapped[str] = mapped_column(String(40), nullable=False)
    badge: Mapped[str | None] = mapped_column(String(80), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    material_limit: Mapped[str] = mapped_column(Text, nullable=False)
    ai_level: Mapped[str] = mapped_column(Text, nullable=False)
    storage: Mapped[str] = mapped_column(Text, nullable=False)
    conditions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Total projects that may be active at once. Distinct from
    # active_project_limit, which is a per-billing-month creation rate.
    active_project_slots: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=2,
        server_default="2",
    )
    active_project_limit: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )
    monthly_material_limit: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=3,
    )
    files_per_project_limit: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=2,
    )
    file_size_limit_mb: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=10,
    )
    project_size_limit_mb: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=20,
    )
    estimated_page_limit: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=25,
    )
    initial_flashcard_limit: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=20,
    )
    quiz_questions_per_quiz: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=8,
    )
    quizzes_per_project_limit: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=3,
    )
    allow_scanned_documents: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    monthly_ai_credits: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=10,
    )
    monthly_ocr_pages: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    monthly_page_limit: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=40,
    )
    ai_chat_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    max_openai_cost_usd_per_cycle: Mapped[Decimal] = mapped_column(
        Numeric(6, 2),
        nullable=False,
        default=Decimal("2.00"),
    )
    stripe_product_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    stripe_price_id: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
        unique=True,
        index=True,
    )
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
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

    features: Mapped[list[SubscriptionPlanFeature]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="SubscriptionPlanFeature.sort_order",
        passive_deletes=True,
    )
    translations: Mapped[list[SubscriptionPlanTranslation]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    user_subscriptions: Mapped[list[UserSubscription]] = relationship(
        back_populates="plan",
    )


class SubscriptionPlanFeature(Base):
    __tablename__ = "subscription_plan_features"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subscription_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    plan: Mapped[SubscriptionPlan] = relationship(back_populates="features")
    translations: Mapped[list[SubscriptionPlanFeatureTranslation]] = relationship(
        back_populates="feature",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class SubscriptionPlanTranslation(Base):
    """Localised copy for a plan. Every column is optional.

    A null field means "no translation yet", and the reader falls back to the
    Romanian text on the plan itself, so a half-finished translation still
    renders a complete page.
    """

    __tablename__ = "subscription_plan_translations"
    __table_args__ = (
        UniqueConstraint(
            "plan_id",
            "locale",
            name="uq_subscription_plan_translations_plan_locale",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subscription_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    locale: Mapped[str] = mapped_column(String(8), nullable=False)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    material_limit: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_level: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage: Mapped[str | None] = mapped_column(Text, nullable=True)
    conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    badge: Mapped[str | None] = mapped_column(String(80), nullable=True)
    discount_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
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

    plan: Mapped[SubscriptionPlan] = relationship(back_populates="translations")


class SubscriptionPlanFeatureTranslation(Base):
    __tablename__ = "subscription_plan_feature_translations"
    __table_args__ = (
        UniqueConstraint(
            "feature_id",
            "locale",
            name="uq_plan_feature_translations_feature_locale",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    feature_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subscription_plan_features.id", ondelete="CASCADE"),
        nullable=False,
    )
    locale: Mapped[str] = mapped_column(String(8), nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
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

    feature: Mapped[SubscriptionPlanFeature] = relationship(
        back_populates="translations",
    )


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subscription_plans.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    stripe_customer_id: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        index=True,
    )
    stripe_subscription_id: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        unique=True,
        index=True,
    )
    stripe_price_id: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    current_period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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

    user: Mapped[User] = relationship(back_populates="subscriptions")
    plan: Mapped[SubscriptionPlan] = relationship(back_populates="user_subscriptions")
    invoices: Mapped[list[SubscriptionInvoice]] = relationship(
        back_populates="subscription",
    )


class SubscriptionInvoice(Base):
    __tablename__ = "subscription_invoices"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscription_plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_subscriptions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    stripe_invoice_id: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        unique=True,
        index=True,
    )
    stripe_customer_id: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        index=True,
    )
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
        index=True,
    )
    hosted_invoice_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    invoice_pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    currency: Mapped[str] = mapped_column(String(12), nullable=False, default="RON")
    amount_due: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    amount_paid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    email_delivery_error: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    subscription: Mapped[UserSubscription | None] = relationship(
        back_populates="invoices",
    )
    plan: Mapped[SubscriptionPlan | None] = relationship()


class StripeEvent(Base):
    __tablename__ = "stripe_events"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    type: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    payload: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class ManualPlanGrant(Base):
    """A plan an admin put on a user by hand, outside Stripe.

    Used when there is no Stripe subscription to sync from: a comped account,
    a support gesture, or a test user. The grant also writes
    ``User.current_plan_id`` so every entitlement check keeps reading one
    field, and it stays live until an admin revokes it.
    """

    __tablename__ = "manual_plan_grants"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subscription_plans.id", ondelete="RESTRICT"),
        nullable=False,
    )
    granted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    revoked_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    revoke_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    plan: Mapped[SubscriptionPlan] = relationship(foreign_keys=[plan_id])
    user: Mapped[User] = relationship(foreign_keys=[user_id])
    granted_by: Mapped[User | None] = relationship(foreign_keys=[granted_by_id])

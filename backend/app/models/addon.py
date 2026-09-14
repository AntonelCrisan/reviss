from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Final

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User

# The capacity a resource can top up, keyed the same way on the resource, the
# order and the balance so none of the three can drift from the others.
ADDON_RESOURCE_KEYS: Final[tuple[str, ...]] = (
    "ai_credits",
    "ocr_pages",
    "projects",
    "materials",
    "pages",
)

# resource_key -> the order column that records how much of it was bought.
ADDON_PURCHASE_COLUMNS: Final[dict[str, str]] = {
    "ai_credits": "extra_ai_credits",
    "ocr_pages": "extra_ocr_pages",
    "projects": "extra_projects",
    "materials": "extra_materials",
    "pages": "extra_pages",
}

PURCHASE_PENDING: Final = "pending"
PURCHASE_PAID: Final = "paid"


class AddonResource(Base):
    """One thing a subscriber can buy by the unit, for the current cycle.

    Price, bounds and the Stripe Price are all editable from the admin UI, so
    adding a resource or repricing one never needs a deploy.
    """

    __tablename__ = "addon_resources"
    __table_args__ = (
        UniqueConstraint("resource_key", name="uq_addon_resources_resource_key"),
        UniqueConstraint(
            "stripe_price_id", name="uq_addon_resources_stripe_price_id"
        ),
        CheckConstraint(
            "min_quantity >= 1 AND max_quantity >= min_quantity AND step >= 1",
            name="ck_addon_resources_quantity_bounds",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    resource_key: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    unit_label: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    unit_price_ron: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    stripe_product_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    stripe_price_id: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Stripe rejects charges under a per-currency floor, so a unit priced in
    # small change needs a minimum order that clears it.
    min_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    max_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=500)
    step: Mapped[int] = mapped_column(Integer, nullable=False, default=10)

    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
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

    @property
    def is_purchasable(self) -> bool:
        return bool(self.stripe_price_id)

    @property
    def purchase_column(self) -> str | None:
        return ADDON_PURCHASE_COLUMNS.get(self.resource_key)


class AddonPurchase(Base):
    """One order, written before the redirect and credited on the way back.

    Holding the basket here rather than in Stripe metadata keeps it clear of
    metadata size limits and leaves abandoned checkouts visible.
    """

    __tablename__ = "addon_purchases"
    __table_args__ = (
        UniqueConstraint(
            "stripe_checkout_session_id",
            name="uq_addon_purchases_stripe_checkout_session_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=PURCHASE_PENDING,
    )
    stripe_checkout_session_id: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )
    amount_paid: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(12), nullable=False, default="RON")

    extra_projects: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    extra_materials: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    extra_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    extra_ai_credits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    extra_ocr_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    cycle_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    cycle_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    user: Mapped[User] = relationship()

    @property
    def is_paid(self) -> bool:
        return self.status == PURCHASE_PAID

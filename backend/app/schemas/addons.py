from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.models import ADDON_RESOURCE_KEYS


class AddonResourceResponse(BaseModel):
    """One thing a subscriber can buy by the unit."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    resource_key: str
    name: str
    unit_label: str
    description: str
    unit_price_ron: Decimal
    min_quantity: int
    max_quantity: int
    step: int
    # False until a Stripe price is wired up, so the UI can show the resource
    # without offering a button that would fail.
    is_purchasable: bool


class AddonBalanceResponse(BaseModel):
    """What this cycle's paid orders add on top of the plan."""

    projects: int
    materials: int
    pages: int
    ai_credits: int
    ocr_pages: int
    cycle_end: datetime | None


class AddonOfferResponse(BaseModel):
    resources: list[AddonResourceResponse]
    balance: AddonBalanceResponse
    # Sold on paid plans only; the UI points free accounts at the subscription.
    can_purchase: bool


class AddonCheckoutRequest(BaseModel):
    """A basket: resource key to quantity.

    Only quantities come from the client. Prices and bounds are read from the
    resource rows on the server, so nobody can choose what an order costs.
    """

    items: dict[str, int] = Field(min_length=1, max_length=10)

    @field_validator("items")
    @classmethod
    def validate_items(cls, value: dict[str, int]) -> dict[str, int]:
        cleaned: dict[str, int] = {}
        for key, quantity in value.items():
            if key not in ADDON_RESOURCE_KEYS:
                raise ValueError("Resursa ceruta nu exista.")
            if not isinstance(quantity, int) or isinstance(quantity, bool):
                raise ValueError("Cantitatea trebuie sa fie un numar intreg.")
            if quantity < 0 or quantity > 100000:
                raise ValueError("Cantitatea este in afara intervalului permis.")
            if quantity > 0:
                cleaned[key] = quantity
        if not cleaned:
            raise ValueError("Alege cel putin o resursa.")
        return cleaned


class AddonCheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class AddonCheckoutSyncRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=200)


class AddonPurchaseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    amount_paid: int
    currency: str
    extra_projects: int
    extra_materials: int
    extra_pages: int
    extra_ai_credits: int
    extra_ocr_pages: int
    cycle_end: datetime
    created_at: datetime
    paid_at: datetime | None


class AdminAddonResourceUpdate(BaseModel):
    """One resource as the admin editor submits it.

    ``id`` is absent for a resource being created. Price and bounds are all
    editable here, so repricing never needs a deploy.
    """

    id: uuid.UUID | None = None
    resource_key: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    unit_label: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=2000)
    unit_price_ron: Decimal = Field(gt=0, le=Decimal("9999.99"))
    stripe_product_id: str | None = Field(default=None, max_length=120)
    stripe_price_id: str | None = Field(default=None, max_length=120)
    min_quantity: int = Field(ge=1, le=100000)
    max_quantity: int = Field(ge=1, le=100000)
    step: int = Field(ge=1, le=10000)
    is_visible: bool = True
    sort_order: int = Field(default=0, ge=0)

    @field_validator("resource_key")
    @classmethod
    def known_resource(cls, value: str) -> str:
        key = value.strip().lower()
        if key not in ADDON_RESOURCE_KEYS:
            raise ValueError("Resursa ceruta nu exista.")
        return key

    @field_validator("stripe_product_id", "stripe_price_id", mode="after")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @model_validator(mode="after")
    def bounds_make_sense(self) -> AdminAddonResourceUpdate:
        if self.max_quantity < self.min_quantity:
            raise ValueError("Maximul nu poate fi sub minim.")
        # The stepper only ever offers multiples of the step, so a minimum that
        # is not one of them would be unreachable from the UI.
        if self.min_quantity % self.step != 0:
            raise ValueError("Minimul trebuie sa fie un multiplu al pasului.")
        return self


class AdminAddonResourcesUpdate(BaseModel):
    resources: list[AdminAddonResourceUpdate] = Field(
        default_factory=list,
        max_length=10,
    )


class AdminAddonResourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    resource_key: str
    name: str
    unit_label: str
    description: str
    unit_price_ron: Decimal
    stripe_product_id: str | None
    stripe_price_id: str | None
    min_quantity: int
    max_quantity: int
    step: int
    is_visible: bool
    sort_order: int
    is_purchasable: bool

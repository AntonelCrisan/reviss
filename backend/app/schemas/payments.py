import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserResponse


class CheckoutSessionCreateRequest(BaseModel):
    plan_slug: str = Field(min_length=1, max_length=80)


class CheckoutSessionResponse(BaseModel):
    checkout_url: str
    session_id: str


class CheckoutSessionSyncRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=255)


class SubscriptionInvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    stripe_invoice_id: str
    number: str | None
    status: str
    currency: str
    amount_due: int
    amount_paid: int
    hosted_invoice_url: str | None
    invoice_pdf_url: str | None
    paid_at: datetime | None
    email_sent_at: datetime | None
    created_at: datetime


class CurrentSubscriptionResponse(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    plan_slug: str
    plan_name: str
    status: str
    current_period_start: datetime | None
    current_period_end: datetime | None
    cancel_at_period_end: bool
    canceled_at: datetime | None


class ManualPlanGrantResponse(BaseModel):
    plan_slug: str
    plan_name: str
    granted_at: datetime


class SubscriptionStatusResponse(BaseModel):
    subscription: CurrentSubscriptionResponse | None
    # Set when an admin put the account on this plan by hand. There is no
    # Stripe subscription behind it and no next payment to announce.
    manual_plan: ManualPlanGrantResponse | None = None


class SubscriptionActionResponse(BaseModel):
    user: UserResponse
    subscription: CurrentSubscriptionResponse | None
    message: str

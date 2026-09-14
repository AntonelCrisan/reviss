from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.schemas.user import ThemePreference, UserRole

SessionStatus = Literal["activă", "expirată", "revocată"]


class AdminUserSessionResponse(BaseModel):
    id: uuid.UUID
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    status: SessionStatus
    user_agent: str | None
    ip_address: str | None


class AdminUserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    is_active: bool
    role: UserRole
    created_at: datetime
    updated_at: datetime
    terms_accepted_at: datetime
    terms_version: str
    newsletter_consent: bool
    newsletter_consent_at: datetime | None
    theme_preference: ThemePreference
    total_sessions: int
    active_sessions: int
    last_session_at: datetime | None
    last_seen_at: datetime | None
    sessions: list[AdminUserSessionResponse]
    subscription: AdminUserSubscriptionResponse


class AdminUserManualGrantResponse(BaseModel):
    id: uuid.UUID
    plan_slug: str
    plan_name: str
    reason: str
    granted_by_email: str | None
    created_at: datetime


class AdminUserSubscriptionResponse(BaseModel):
    """What the admin screen needs to judge a user's billing state."""

    current_plan_slug: str | None
    current_plan_name: str | None
    current_plan_price_ron: Decimal | None
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    status: str | None
    cancel_at_period_end: bool
    current_period_start: datetime | None
    current_period_end: datetime | None
    canceled_at: datetime | None
    manual_grant: AdminUserManualGrantResponse | None


class AdminManualPlanGrantRequest(BaseModel):
    plan_slug: str = Field(min_length=1, max_length=80)
    # Required on purpose: without it nobody can tell three months later why
    # an account is on a paid plan for free.
    reason: str = Field(min_length=10, max_length=1000)


class AdminManualPlanRevokeRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class AdminSubscriptionActionResponse(BaseModel):
    subscription: AdminUserSubscriptionResponse
    message: str


class AdminUserUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> AdminUserUpdate:
        if self.role is None and self.is_active is None:
            raise ValueError("Trimite cel putin un camp de actualizat.")
        return self

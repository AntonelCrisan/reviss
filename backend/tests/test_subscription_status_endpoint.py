"""What /api/payments/subscription tells the upgrade page about the plan."""

import asyncio
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

import app.api.routes.payments as payments_routes
from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.db.session import get_db_session
from app.main import app
from app.services import stripe_payments as stripe_module
from app.services.stripe_payments import (
    _SUBSCRIPTIONS_MISSING_IN_STRIPE,
    StripePaymentService,
    StripeRequestError,
)


def _plan(slug: str = "pro", name: str = "Pro"):
    return SimpleNamespace(id=uuid.uuid4(), slug=slug, name=name)


def _grant(plan):
    return SimpleNamespace(plan=plan, created_at=datetime.now(UTC))


def _stale_subscription(plan):
    """A row left behind by a checkout that never got its webhook.

    It has no billing period, so there is no renewal date to print -- which is
    exactly the case that used to leave the page silent.
    """
    return SimpleNamespace(
        id=uuid.uuid4(),
        plan_id=plan.id,
        plan=plan,
        status="checkout_completed",
        current_period_start=None,
        current_period_end=None,
        cancel_at_period_end=False,
        canceled_at=None,
    )


def _status(monkeypatch, *, subscription, grant) -> dict:
    monkeypatch.setattr(
        payments_routes,
        "StripePaymentService",
        lambda _session, _settings: SimpleNamespace(
            get_current_paid_subscription=_async(subscription),
            get_active_manual_plan=_async(grant),
        ),
    )
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=uuid.uuid4()
    )
    app.dependency_overrides[get_db_session] = lambda: SimpleNamespace()
    app.dependency_overrides[get_settings] = get_settings

    try:
        with TestClient(app) as client:
            response = client.get("/api/payments/subscription")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    return response.json()


def _async(value):
    async def call(**_kwargs):
        return value

    return call


def test_a_granted_plan_is_reported_even_without_a_subscription(monkeypatch) -> None:
    plan = _plan()
    body = _status(monkeypatch, subscription=None, grant=_grant(plan))

    assert body["subscription"] is None
    assert body["manual_plan"]["plan_name"] == "Pro"


def test_a_stale_checkout_row_does_not_hide_the_grant(monkeypatch) -> None:
    """The page decides what to say from this, so both facts have to travel."""
    plan = _plan()
    body = _status(
        monkeypatch, subscription=_stale_subscription(plan), grant=_grant(plan)
    )

    assert body["subscription"]["current_period_end"] is None
    assert body["manual_plan"]["plan_slug"] == "pro"


def test_a_paying_account_reports_no_grant(monkeypatch) -> None:
    body = _status(monkeypatch, subscription=_stale_subscription(_plan()), grant=None)

    assert body["manual_plan"] is None


def test_a_subscription_stripe_does_not_have_is_asked_about_once(monkeypatch) -> None:
    """A row left over from test mode must not cost a Stripe call per page load."""
    _SUBSCRIPTIONS_MISSING_IN_STRIPE.clear()
    calls = []

    class _Client:
        def __init__(self, _settings) -> None:
            pass

        async def retrieve_subscription(self, *, subscription_id):
            calls.append(subscription_id)
            raise StripeRequestError(
                "No such subscription", error_code="resource_missing"
            )

    monkeypatch.setattr(stripe_module, "StripeClient", _Client)

    subscription = SimpleNamespace(
        stripe_subscription_id="sub_from_test_mode",
        current_period_start=None,
        current_period_end=None,
    )

    async def backfill_twice():
        for _ in range(2):
            # A fresh service each time, as a new request would build.
            service = StripePaymentService.__new__(StripePaymentService)
            service._settings = SimpleNamespace()
            service._period_backfill_attempted = set()
            await service._backfill_subscription_period(subscription=subscription)

    asyncio.run(backfill_twice())

    assert calls == ["sub_from_test_mode"]
    _SUBSCRIPTIONS_MISSING_IN_STRIPE.clear()

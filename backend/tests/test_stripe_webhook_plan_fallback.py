"""A subscription keeps being tracked after its plan gets a new Stripe price."""

import asyncio
import uuid
from types import SimpleNamespace

from app.models import SubscriptionPlan, User, UserSubscription
from app.services.stripe_payments import StripePaymentService

SUBSCRIPTION_EVENT = {
    "id": "sub_old_price",
    "customer": "cus_1",
    "status": "canceled",
    "cancel_at_period_end": False,
    "canceled_at": 1758678400,
    "items": {
        "data": [
            {
                "price": {"id": "price_old"},
                "current_period_start": 1756000000,
                "current_period_end": 1758678400,
            }
        ]
    },
}


class _FakeSession:
    """Answers the handler's lookups the way the database would after a price
    change: no plan carries the old price any more, but the subscription row
    still points at its plan."""

    def __init__(self, plan, user, existing_subscription):
        self.plan = plan
        self.user = user
        self.existing_subscription = existing_subscription
        self.plan_lookups_by_price = 0

    async def scalar(self, statement):
        entity = statement.column_descriptions[0]["entity"]
        if entity is SubscriptionPlan:
            self.plan_lookups_by_price += 1
            return None
        if entity is User:
            return self.user
        if entity is UserSubscription:
            return self.existing_subscription
        raise AssertionError(f"unexpected lookup: {entity}")

    async def get(self, model, key):
        assert model is SubscriptionPlan
        assert key == self.plan.id
        return self.plan


class _RecordingService(StripePaymentService):
    def __init__(self, session):
        self._session = session
        self._settings = None
        self.upserts = []

    async def _upsert_subscription(self, **kwargs):
        self.upserts.append(kwargs)


def test_subscription_event_falls_back_to_the_stored_plan() -> None:
    plan = SimpleNamespace(id=uuid.uuid4(), stripe_price_id="price_new")
    user = SimpleNamespace(id=uuid.uuid4(), stripe_customer_id="cus_1")
    existing = SimpleNamespace(stripe_subscription_id="sub_old_price", plan_id=plan.id)
    session = _FakeSession(plan, user, existing)
    service = _RecordingService(session)

    asyncio.run(service._handle_subscription_event(SUBSCRIPTION_EVENT))

    assert session.plan_lookups_by_price == 1
    assert len(service.upserts) == 1
    upsert = service.upserts[0]
    assert upsert["plan"] is plan
    assert upsert["user"] is user
    assert upsert["status"] == "canceled"
    assert upsert["stripe_subscription_id"] == "sub_old_price"
    # The price actually billed is kept, not the plan's current one.
    assert upsert["stripe_price_id"] == "price_old"


def test_unknown_subscription_with_unknown_price_is_still_ignored() -> None:
    plan = SimpleNamespace(id=uuid.uuid4(), stripe_price_id="price_new")
    user = SimpleNamespace(id=uuid.uuid4(), stripe_customer_id="cus_1")
    session = _FakeSession(plan, user, existing_subscription=None)
    service = _RecordingService(session)

    asyncio.run(service._handle_subscription_event(SUBSCRIPTION_EVENT))

    assert service.upserts == []

"""Admin-side subscription repair: re-sync from Stripe and manual plan grants."""

import asyncio
import uuid
from types import SimpleNamespace

import pytest

from app.services import stripe_payments as stripe_module
from app.services.stripe_payments import (
    StripePaymentService,
    StripePlanUnavailableError,
)


class _FakeSession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commits = 0
        self.flushes = 0

    def add(self, entity: object) -> None:
        self.added.append(entity)

    async def scalar(self, _statement: object) -> None:
        # Tests that care about a lookup replace this or stub the helper.
        return None

    async def flush(self) -> None:
        self.flushes += 1

    async def commit(self) -> None:
        self.commits += 1


def _service(session: _FakeSession) -> StripePaymentService:
    service = StripePaymentService.__new__(StripePaymentService)
    service._session = session
    service._settings = SimpleNamespace()
    return service


def _audit_actions(session: _FakeSession) -> list[str]:
    return [
        getattr(entity, "action", None)
        for entity in session.added
        if getattr(entity, "action", None) is not None
    ]


def _actor() -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), email="admin@reviss.app", full_name="Admin")


# --- re-sync from Stripe ----------------------------------------------------


def test_resync_replays_every_stripe_subscription_oldest_first(monkeypatch) -> None:
    """The newest subscription must settle the final plan, so order matters."""
    session = _FakeSession()
    service = _service(session)
    user = SimpleNamespace(
        id=uuid.uuid4(),
        email="student@example.com",
        stripe_customer_id="cus_1",
        current_plan=SimpleNamespace(slug="pro"),
    )

    returned = [
        {"id": "sub_new", "created": 200},
        {"id": "sub_old", "created": 100},
    ]

    class _FakeStripe:
        def __init__(self, _settings) -> None:
            pass

        async def list_customer_subscriptions(self, *, customer_id):
            assert customer_id == "cus_1"
            return returned

    monkeypatch.setattr(stripe_module, "StripeClient", _FakeStripe)

    replayed: list[str] = []

    async def _handle(subscription, *, cancel_superseded=True):  # noqa: ARG001
        replayed.append(subscription["id"])

    async def _noop(**_kwargs):
        return None

    async def _refreshed(_user):
        return user

    service._handle_subscription_event = _handle
    service._sync_latest_invoices_for_user = _noop
    service._refreshed_user = _refreshed

    _, seen = asyncio.run(
        service.admin_resync_subscriptions(
            user=user,
            actor=_actor(),
            user_agent=None,
            ip_address=None,
        )
    )

    assert replayed == ["sub_old", "sub_new"]
    assert seen == 2
    assert "admin.subscription.resynced" in _audit_actions(session)
    assert session.commits == 1


def test_resync_never_cancels_anything_in_stripe(monkeypatch) -> None:
    """A repair button must not write back to Stripe.

    Replaying an active subscription through the normal path supersedes the
    user's other subscriptions, which issues real DELETE calls to Stripe. The
    re-sync has to suppress that, or reading state would destroy it.
    """
    session = _FakeSession()
    service = _service(session)
    user = SimpleNamespace(
        id=uuid.uuid4(),
        email="student@example.com",
        stripe_customer_id="cus_1",
        current_plan=SimpleNamespace(slug="focus"),
    )

    class _FakeStripe:
        def __init__(self, _settings) -> None:
            pass

        async def list_customer_subscriptions(self, *, customer_id):  # noqa: ARG002
            return [
                {"id": "sub_a", "created": 100},
                {"id": "sub_b", "created": 200},
            ]

        async def cancel_subscription(self, *, subscription_id):  # noqa: ARG002
            raise AssertionError("re-sync must not cancel subscriptions in Stripe")

    monkeypatch.setattr(stripe_module, "StripeClient", _FakeStripe)

    seen_flags: list[bool] = []

    async def _handle(subscription, *, cancel_superseded=True):  # noqa: ARG001
        seen_flags.append(cancel_superseded)

    async def _noop(**_kwargs):
        return None

    async def _refreshed(_user):
        return user

    service._handle_subscription_event = _handle
    service._sync_latest_invoices_for_user = _noop
    service._refreshed_user = _refreshed

    asyncio.run(
        service.admin_resync_subscriptions(
            user=user,
            actor=_actor(),
            user_agent=None,
            ip_address=None,
        )
    )

    assert seen_flags == [False, False]


def test_resync_keeps_the_plan_of_a_still_active_subscription(monkeypatch) -> None:
    """Replaying cancelled subscriptions must not wipe a live one.

    Per-event logic drops the user to the free plan when a cancelled
    subscription matches their current plan. Replaying a long history runs
    that branch many times, so the plan has to be settled once at the end
    from the final state.
    """
    session = _FakeSession()
    service = _service(session)
    active_plan_id = uuid.uuid4()
    user = SimpleNamespace(
        id=uuid.uuid4(),
        email="student@example.com",
        stripe_customer_id="cus_1",
        current_plan=SimpleNamespace(slug="focus"),
        current_plan_id=None,
    )

    class _FakeStripe:
        def __init__(self, _settings) -> None:
            pass

        async def list_customer_subscriptions(self, *, customer_id):  # noqa: ARG002
            return [
                {"id": "sub_live", "created": 100},
                {"id": "sub_dead", "created": 200},
            ]

    monkeypatch.setattr(stripe_module, "StripeClient", _FakeStripe)

    async def _handle(subscription, *, cancel_superseded=True):  # noqa: ARG001
        # Mimic the real branch that drops the plan on a cancelled event.
        user.current_plan_id = None

    async def _noop(**_kwargs):
        return None

    async def _fetch_paid(*, user):  # noqa: ARG001
        return SimpleNamespace(plan_id=active_plan_id)

    async def _refreshed(_user):
        return user

    async def _no_grant(*, user):  # noqa: ARG001
        return None

    service._handle_subscription_event = _handle
    service._sync_latest_invoices_for_user = _noop
    service._fetch_current_paid_subscription = _fetch_paid
    service._fetch_active_manual_grant = _no_grant
    service._refreshed_user = _refreshed

    asyncio.run(
        service.admin_resync_subscriptions(
            user=user,
            actor=_actor(),
            user_agent=None,
            ip_address=None,
        )
    )

    assert user.current_plan_id == active_plan_id


def test_resync_keeps_a_manual_grant_when_no_subscription_is_live(
    monkeypatch,
) -> None:
    session = _FakeSession()
    service = _service(session)
    granted_plan_id = uuid.uuid4()
    user = SimpleNamespace(
        id=uuid.uuid4(),
        email="student@example.com",
        stripe_customer_id="cus_1",
        current_plan=SimpleNamespace(slug="pro"),
        current_plan_id=None,
    )

    class _FakeStripe:
        def __init__(self, _settings) -> None:
            pass

        async def list_customer_subscriptions(self, *, customer_id):  # noqa: ARG002
            return [{"id": "sub_dead", "created": 100}]

    monkeypatch.setattr(stripe_module, "StripeClient", _FakeStripe)

    async def _handle(subscription, *, cancel_superseded=True):  # noqa: ARG001
        user.current_plan_id = None

    async def _noop(**_kwargs):
        return None

    async def _fetch_paid(*, user):  # noqa: ARG001
        return None

    async def _fetch_grant(*, user):  # noqa: ARG001
        return SimpleNamespace(plan_id=granted_plan_id)

    async def _refreshed(_user):
        return user

    service._handle_subscription_event = _handle
    service._sync_latest_invoices_for_user = _noop
    service._fetch_current_paid_subscription = _fetch_paid
    service._fetch_active_manual_grant = _fetch_grant
    service._refreshed_user = _refreshed

    asyncio.run(
        service.admin_resync_subscriptions(
            user=user,
            actor=_actor(),
            user_agent=None,
            ip_address=None,
        )
    )

    # A re-sync must not quietly undo a grant an admin made on purpose.
    assert user.current_plan_id == granted_plan_id


def test_resync_without_a_stripe_customer_is_refused() -> None:
    session = _FakeSession()
    service = _service(session)
    user = SimpleNamespace(id=uuid.uuid4(), email="x@y.ro", stripe_customer_id=None)

    with pytest.raises(StripePlanUnavailableError):
        asyncio.run(
            service.admin_resync_subscriptions(
                user=user,
                actor=_actor(),
                user_agent=None,
                ip_address=None,
            )
        )

    assert session.commits == 0


# --- manual plan grants -----------------------------------------------------


def _grant_service(session, plan, active_grant):
    service = _service(session)

    async def _scalar(_statement):
        return plan

    async def _fetch_grant(*, user):  # noqa: ARG001
        return active_grant

    async def _reactivate(**_kwargs):
        return None

    async def _refreshed(user):
        return user

    session.scalar = _scalar
    service._fetch_active_manual_grant = _fetch_grant
    service._reactivate_projects_for_plan = _reactivate
    service._refreshed_user = _refreshed
    return service


def test_manual_grant_sets_the_plan_and_records_the_reason() -> None:
    session = _FakeSession()
    plan = SimpleNamespace(id=uuid.uuid4(), slug="pro", name="Pro")
    service = _grant_service(session, plan, active_grant=None)
    user = SimpleNamespace(
        id=uuid.uuid4(),
        email="student@example.com",
        current_plan_id=None,
    )

    refreshed, grant = asyncio.run(
        service.admin_grant_manual_plan(
            user=user,
            actor=_actor(),
            plan_slug="pro",
            reason="  compensatie pentru plata esuata  ",
            user_agent=None,
            ip_address=None,
        )
    )

    # Entitlement checks all read current_plan_id, so the grant must write it.
    assert refreshed.current_plan_id == plan.id
    assert grant.reason == "compensatie pentru plata esuata"
    assert "admin.subscription.manual_plan.granted" in _audit_actions(session)


def test_a_second_live_manual_grant_is_refused() -> None:
    session = _FakeSession()
    plan = SimpleNamespace(id=uuid.uuid4(), slug="pro", name="Pro")
    existing = SimpleNamespace(id=uuid.uuid4())
    service = _grant_service(session, plan, active_grant=existing)
    user = SimpleNamespace(id=uuid.uuid4(), email="s@x.ro", current_plan_id=plan.id)

    with pytest.raises(StripePlanUnavailableError):
        asyncio.run(
            service.admin_grant_manual_plan(
                user=user,
                actor=_actor(),
                plan_slug="pro",
                reason="inca un motiv suficient de lung",
                user_agent=None,
                ip_address=None,
            )
        )

    assert session.commits == 0


def test_revoking_falls_back_to_a_real_paid_subscription() -> None:
    session = _FakeSession()
    service = _service(session)
    paid_plan_id = uuid.uuid4()
    grant = SimpleNamespace(revoked_at=None, revoked_by_id=None, revoke_reason=None)
    user = SimpleNamespace(
        id=uuid.uuid4(),
        email="s@x.ro",
        current_plan_id=uuid.uuid4(),
    )

    async def _fetch_grant(*, user):  # noqa: ARG001
        return grant

    async def _fetch_paid(*, user):  # noqa: ARG001
        return SimpleNamespace(plan_id=paid_plan_id)

    async def _refreshed(user):
        return user

    service._fetch_active_manual_grant = _fetch_grant
    service._fetch_current_paid_subscription = _fetch_paid
    service._refreshed_user = _refreshed

    refreshed = asyncio.run(
        service.admin_revoke_manual_plan(
            user=user,
            actor=_actor(),
            reason="nu mai e cazul",
            user_agent=None,
            ip_address=None,
        )
    )

    # A paying user must not be dropped to the free plan by a revoke.
    assert refreshed.current_plan_id == paid_plan_id
    assert grant.revoked_at is not None
    assert grant.revoke_reason == "nu mai e cazul"
    assert "admin.subscription.manual_plan.revoked" in _audit_actions(session)


def test_revoking_without_a_subscription_falls_back_to_the_free_plan() -> None:
    session = _FakeSession()
    service = _service(session)
    free_plan = SimpleNamespace(id=uuid.uuid4(), slug="start")
    grant = SimpleNamespace(revoked_at=None, revoked_by_id=None, revoke_reason=None)
    user = SimpleNamespace(
        id=uuid.uuid4(),
        email="s@x.ro",
        current_plan_id=uuid.uuid4(),
    )

    async def _fetch_grant(*, user):  # noqa: ARG001
        return grant

    async def _fetch_paid(*, user):  # noqa: ARG001
        return None

    async def _scalar(_statement):
        return free_plan

    async def _refreshed(user):
        return user

    session.scalar = _scalar
    service._fetch_active_manual_grant = _fetch_grant
    service._fetch_current_paid_subscription = _fetch_paid
    service._refreshed_user = _refreshed

    refreshed = asyncio.run(
        service.admin_revoke_manual_plan(
            user=user,
            actor=_actor(),
            reason=None,
            user_agent=None,
            ip_address=None,
        )
    )

    assert refreshed.current_plan_id == free_plan.id
    assert grant.revoke_reason is None


def test_revoking_without_a_grant_is_refused() -> None:
    session = _FakeSession()
    service = _service(session)

    async def _fetch_grant(*, user):  # noqa: ARG001
        return None

    service._fetch_active_manual_grant = _fetch_grant

    with pytest.raises(StripePlanUnavailableError):
        asyncio.run(
            service.admin_revoke_manual_plan(
                user=SimpleNamespace(id=uuid.uuid4(), email="s@x.ro"),
                actor=_actor(),
                reason=None,
                user_agent=None,
                ip_address=None,
            )
        )

    assert session.commits == 0

# --- Stripe listing --------------------------------------------------------


def test_listing_follows_every_page_of_subscriptions() -> None:
    """A partial list would settle the plan from an incomplete history."""
    from app.services.stripe_payments import StripeClient

    client = StripeClient.__new__(StripeClient)
    calls: list[dict] = []

    def _request(method, path, data=None):  # noqa: ARG001
        calls.append(dict(data or {}))
        if "starting_after" not in (data or {}):
            return {
                "data": [{"id": "sub_1"}, {"id": "sub_2"}],
                "has_more": True,
            }
        return {"data": [{"id": "sub_3"}], "has_more": False}

    client._request = _request

    result = asyncio.run(client.list_customer_subscriptions(customer_id="cus_1"))

    assert [item["id"] for item in result] == ["sub_1", "sub_2", "sub_3"]
    assert len(calls) == 2
    assert calls[0]["status"] == "all"
    assert calls[1]["starting_after"] == "sub_2"


def test_listing_stops_when_stripe_keeps_claiming_more() -> None:
    """has_more must never be able to spin the loop forever."""
    from app.services.stripe_payments import (
        _MAX_LISTED_SUBSCRIPTIONS,
        StripeClient,
    )

    client = StripeClient.__new__(StripeClient)
    counter = {"n": 0}

    def _request(method, path, data=None):  # noqa: ARG001
        counter["n"] += 1
        start = counter["n"] * 100
        return {
            "data": [{"id": f"sub_{start + i}"} for i in range(100)],
            "has_more": True,
        }

    client._request = _request

    result = asyncio.run(client.list_customer_subscriptions(customer_id="cus_1"))

    assert len(result) >= _MAX_LISTED_SUBSCRIPTIONS
    assert counter["n"] <= (_MAX_LISTED_SUBSCRIPTIONS // 100) + 1


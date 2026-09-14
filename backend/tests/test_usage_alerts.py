"""Warning a user before an allowance runs out, and before a plan ends."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from app.services.projects import ProjectValidationError
from app.services.usage_alerts import (
    EXPIRY_NOTICE_DAYS,
    WARNING_THRESHOLD,
    UsageAlertService,
    UsageMetric,
    _format_date,
)


def _metric(used: int, limit: int) -> UsageMetric:
    return UsageMetric("ai_credits", "Credite AI", "credite", used, limit)


# --- thresholds -------------------------------------------------------------


def test_a_quiet_allowance_says_nothing() -> None:
    """Nagging from halfway trains people to ignore the message."""
    metric = _metric(used=50, limit=120)

    assert not metric.needs_warning
    assert not metric.is_reached


def test_the_warning_starts_at_the_threshold() -> None:
    limit = 100
    just_below = _metric(int(limit * WARNING_THRESHOLD) - 1, limit)
    at_threshold = _metric(int(limit * WARNING_THRESHOLD), limit)

    assert not just_below.needs_warning
    assert at_threshold.needs_warning


def test_a_full_allowance_is_reached_not_merely_warned() -> None:
    """Telling someone they are "close to" a limit they hit reads as careless."""
    metric = _metric(used=120, limit=120)

    assert metric.is_reached
    assert not metric.needs_warning


def test_going_over_still_counts_as_reached() -> None:
    metric = _metric(used=140, limit=120)

    assert metric.is_reached
    assert metric.percent == 100


def test_an_allowance_of_zero_never_warns() -> None:
    """A resource the plan does not include is not a limit being approached."""
    metric = _metric(used=0, limit=0)

    assert not metric.needs_warning
    assert not metric.is_reached
    assert metric.percent == 0


def test_the_percentage_is_reported_for_the_message() -> None:
    assert _metric(108, 120).percent == 90
    assert _metric(96, 120).percent == 80


# --- expiry -----------------------------------------------------------------


def test_notices_go_out_a_week_and_a_few_days_ahead() -> None:
    """Two chances to act: one to plan, one to remember."""
    assert EXPIRY_NOTICE_DAYS == (7, 3)
    assert 5 not in EXPIRY_NOTICE_DAYS
    assert 0 not in EXPIRY_NOTICE_DAYS


# --- dates ------------------------------------------------------------------


def test_dates_are_written_in_the_reader_language() -> None:
    when = datetime(2026, 10, 1, tzinfo=UTC)

    assert _format_date(when, "ro") == "1 octombrie 2026"
    assert _format_date(when, "en") == "1 October 2026"
    assert _format_date(when, "fr") == "1 octobre 2026"


def test_an_unknown_language_falls_back_to_romanian() -> None:
    when = datetime(2026, 10, 1, tzinfo=UTC)

    assert _format_date(when, "de") == "1 octombrie 2026"


# --- resilience -------------------------------------------------------------


class _FakeSavepoint:
    """Stands in for session.begin_nested()."""

    def __init__(self, owner: _FakeSession) -> None:
        self._owner = owner

    async def __aenter__(self) -> _FakeSavepoint:
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        if exc_type is not None:
            self._owner.rolled_back += 1
        return False


class _FakeSession:
    def __init__(self, users: list[object]) -> None:
        self._users = users
        self.rolled_back = 0

    async def scalars(self, _statement: object) -> object:
        users = self._users
        return type("Result", (), {"all": staticmethod(lambda: users)})()

    def begin_nested(self) -> _FakeSavepoint:
        return _FakeSavepoint(self)


class _User:
    def __init__(self, name: str, *, broken: bool = False) -> None:
        self.id = name
        self.broken = broken


def test_one_broken_account_does_not_silence_everybody_else() -> None:
    """A user with no plan is a state the schema allows, so it will happen.

    Letting it escape would stop the alerts for every account after it, on
    every run, until someone noticed the cron had been failing.
    """
    users = [_User("a"), _User("b", broken=True), _User("c")]
    session = _FakeSession(users)

    service = UsageAlertService.__new__(UsageAlertService)
    service._session = session

    async def run_for_user(user: _User) -> int:
        if user.broken:
            raise ProjectValidationError("Alege un plan activ pentru a continua.")
        return 1

    service.run_for_user = run_for_user

    sent = asyncio.run(service.run_for_all_users())

    assert sent == 2, "the healthy accounts still get their alerts"
    assert session.rolled_back == 1, "only the failing account is undone"

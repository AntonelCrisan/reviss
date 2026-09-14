"""An admin reset of an account's usage cycle."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.services.billing_window import _apply_usage_reset

CYCLE_START = datetime(2026, 9, 1, tzinfo=UTC)
CYCLE_END = datetime(2026, 10, 1, tzinfo=UTC)
WINDOW = (CYCLE_START, CYCLE_END)


def _user(reset_at: datetime | None) -> SimpleNamespace:
    return SimpleNamespace(usage_reset_at=reset_at)


def test_no_reset_leaves_the_window_alone() -> None:
    assert _apply_usage_reset(WINDOW, _user(None)) == WINDOW


def test_a_reset_inside_the_cycle_moves_the_start_forward() -> None:
    """Everything created before the reset falls outside the window.

    That is the whole mechanism: usage is counted, never stored, so a later
    start is what makes the figures read zero.
    """
    reset_at = datetime(2026, 9, 14, 12, 0, tzinfo=UTC)

    start, end = _apply_usage_reset(WINDOW, _user(reset_at))

    assert start == reset_at
    # The cycle still ends when it was always going to end.
    assert end == CYCLE_END


def test_a_reset_from_a_previous_cycle_expires_on_its_own() -> None:
    """The reset must not follow the account into the next cycle.

    Once a new billing period opens, its start is more recent than the stored
    timestamp, so the reset stops having any effect without anything having to
    clear it. This is what keeps a renewal behaving normally.
    """
    stale_reset = datetime(2026, 8, 20, tzinfo=UTC)

    assert _apply_usage_reset(WINDOW, _user(stale_reset)) == WINDOW


def test_a_reset_at_the_exact_cycle_start_changes_nothing() -> None:
    assert _apply_usage_reset(WINDOW, _user(CYCLE_START)) == WINDOW


def test_a_reset_at_or_after_the_cycle_end_is_ignored() -> None:
    """Never produce an empty or inverted window.

    A clock skew or a reset landing on the boundary must not yield a window
    where start >= end, which would make every limit read as unusable.
    """
    assert _apply_usage_reset(WINDOW, _user(CYCLE_END)) == WINDOW
    assert _apply_usage_reset(WINDOW, _user(CYCLE_END + timedelta(days=3))) == WINDOW


def test_the_window_stays_ordered_for_every_reset_position() -> None:
    candidates = [
        CYCLE_START - timedelta(days=10),
        CYCLE_START,
        CYCLE_START + timedelta(seconds=1),
        CYCLE_END - timedelta(seconds=1),
        CYCLE_END,
        CYCLE_END + timedelta(days=10),
    ]

    for reset_at in candidates:
        start, end = _apply_usage_reset(WINDOW, _user(reset_at))
        assert start < end, reset_at
        assert end == CYCLE_END, reset_at


def test_a_user_without_the_attribute_is_tolerated() -> None:
    """Lightweight stand-ins for a user turn up all over the services."""
    assert _apply_usage_reset(WINDOW, SimpleNamespace()) == WINDOW

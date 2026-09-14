"""Free-text filters must match what was typed, not something wider."""

from datetime import UTC, datetime

from app.api.routes.audit_logs import _as_utc
from app.core.search import escape_like

# --- LIKE wildcards ---------------------------------------------------------


def test_a_plain_term_is_left_alone() -> None:
    assert escape_like("admin.user.delete") == "admin.user.delete"


def test_percent_is_matched_as_a_character() -> None:
    """Unescaped, a search for "%" quietly returns the entire table."""
    assert escape_like("%") == "\\%"
    assert escape_like("100%") == "100\\%"


def test_underscore_is_matched_as_a_character() -> None:
    """LIKE reads "_" as "any single character", so a_b would match axb."""
    assert escape_like("a_b") == "a\\_b"


def test_a_backslash_survives_escaping() -> None:
    """The backslash has to be doubled first, or it would escape the escape."""
    assert escape_like("c:\\x") == "c:\\\\x"


def test_escaping_order_does_not_corrupt_a_mixed_term() -> None:
    assert escape_like("50%_\\") == "50\\%\\_\\\\"


# --- date boundaries --------------------------------------------------------


def test_an_aware_boundary_is_kept_as_sent() -> None:
    """The browser knows the reader's timezone; the server must not second-guess it."""
    sent = datetime(2026, 9, 13, 21, 0, tzinfo=UTC)

    assert _as_utc(sent) == sent


def test_a_naive_boundary_is_pinned_to_utc() -> None:
    """Left naive, the database session's timezone would decide the instant,
    which is Europe/Bucharest in development and UTC in production."""
    assert _as_utc(datetime(2026, 9, 14)) == datetime(2026, 9, 14, tzinfo=UTC)

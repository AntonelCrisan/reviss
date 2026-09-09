import asyncio
from datetime import date

from app.api.routes.visitors import _client_ip, ping_visit
from app.schemas.visitors import VisitorPingRequest
from app.services.visitors import _compute_visitor_hash
from tests.test_compliance_security import build_request


def test_client_ip_uses_the_entry_added_by_the_trusted_proxy() -> None:
    # The edge appends the real address last; anything before it came from
    # the client and must not be able to choose its own rate-limit bucket.
    request = build_request(headers={"x-forwarded-for": "10.0.0.1, 203.0.113.7"})
    assert _client_ip(request) == "203.0.113.7"

    spoofed = build_request(
        headers={"x-forwarded-for": "198.51.100.99, 203.0.113.7"}
    )
    assert _client_ip(spoofed) == "203.0.113.7"


def test_client_ip_ignores_client_supplied_alternative_headers() -> None:
    request = build_request(headers={"x-real-ip": "198.51.100.99"})
    assert _client_ip(request) == "10.0.0.5"


def test_client_ip_falls_back_to_connection_client() -> None:
    request = build_request()
    assert _client_ip(request) == "10.0.0.5"


def test_visitor_hash_is_stable_for_same_day() -> None:
    first = _compute_visitor_hash(
        secret="secret",
        ip_address="203.0.113.7",
        user_agent="TestAgent/1.0",
        visit_date=date(2026, 8, 26),
    )
    second = _compute_visitor_hash(
        secret="secret",
        ip_address="203.0.113.7",
        user_agent="TestAgent/1.0",
        visit_date=date(2026, 8, 26),
    )
    assert first == second


def test_visitor_hash_rotates_across_days() -> None:
    day_one = _compute_visitor_hash(
        secret="secret",
        ip_address="203.0.113.7",
        user_agent="TestAgent/1.0",
        visit_date=date(2026, 8, 26),
    )
    day_two = _compute_visitor_hash(
        secret="secret",
        ip_address="203.0.113.7",
        user_agent="TestAgent/1.0",
        visit_date=date(2026, 8, 27),
    )
    assert day_one != day_two


def test_ping_skips_tracking_for_authenticated_users() -> None:
    request = build_request()
    settings = object()
    current_user = object()

    response = asyncio.run(
        ping_visit(
            payload=VisitorPingRequest(path="/myaccount"),
            request=request,
            session=None,  # type: ignore[arg-type]
            settings=settings,  # type: ignore[arg-type]
            current_user=current_user,  # type: ignore[arg-type]
        )
    )

    assert response.tracked is False

"""The admin usage view: correct numbers, and not more work than it needs."""

import inspect

from app.api.routes import admin_users
from app.services.projects import StudyProjectService


def test_usage_view_does_not_load_auth_sessions() -> None:
    """Sessions are never read here and an old account holds hundreds.

    _get_user_or_404 eager-loads them because the endpoints that revoke
    sessions need them; this view must use the lighter loader instead.
    """
    src = inspect.getsource(admin_users.get_admin_user_usage)
    assert "_get_user_for_usage_or_404" in src
    assert "_get_user_or_404(" not in src

    loader = inspect.getsource(admin_users._get_user_for_usage_or_404)
    assert "User.sessions" not in loader
    assert "User.current_plan" in loader


def test_usage_view_reuses_the_billing_window_it_already_resolved() -> None:
    """Resolving the cycle hits user_subscriptions; once per request is enough."""
    src = inspect.getsource(admin_users._build_usage_response)
    assert src.count("current_billing_window(") == 1
    assert "window=(window_start, window_end)" in src


def test_get_monthly_usage_accepts_a_precomputed_window() -> None:
    sig = inspect.signature(StudyProjectService.get_monthly_usage)
    assert "window" in sig.parameters
    # Defaulting to None keeps every existing caller working unchanged.
    assert sig.parameters["window"].default is None


def test_project_figures_come_from_a_single_aggregate() -> None:
    """Four separate COUNT passes over the same table were three too many."""
    src = inspect.getsource(admin_users._build_usage_response)
    assert src.count("select(func.count(StudyProject.id))") == 0
    assert src.count("counts.one()") == 1
    # total, deactivated, archived, created-this-cycle
    assert src.count("func.count(StudyProject.id)") == 4


def test_active_project_count_still_comes_from_the_service() -> None:
    """The service owns what "occupying a slot" means.

    Inlining that predicate here would let the admin view and the user's own
    dashboard drift apart silently.
    """
    src = inspect.getsource(admin_users._build_usage_response)
    assert "projects_service.count_active_projects(" in src
    assert "SLOT_OCCUPYING_STATUSES" not in src


def test_reset_reuses_the_same_usage_builder() -> None:
    """The numbers shown after a reset must be built the same way as before.

    A second copy of this logic would let the post-reset panel drift away from
    what the user's own dashboard reports.
    """
    src = inspect.getsource(admin_users.reset_admin_user_usage)
    assert src.count("_build_usage_response(") == 2
    assert "usage_reset_at = now" in src


def test_reset_records_what_it_released() -> None:
    """Without a reason field, the audit trail has to carry the numbers."""
    src = inspect.getsource(admin_users.reset_admin_user_usage)
    assert 'action="admin.usage.reset"' in src
    for field in (
        "released_projects",
        "released_materials",
        "released_pages",
        "released_ai_credits",
        "released_ocr_pages",
    ):
        assert field in src, field

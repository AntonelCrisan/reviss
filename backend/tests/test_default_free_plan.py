"""Every account must land on a plan, because nothing invents limits anymore.

``limits_for_user`` refuses to serve hardcoded limits when ``current_plan`` is
missing, so an account without one cannot create a project at all. These tests
pin the two places that has to be guaranteed: registration, and the backfill
for the accounts registered before it was.
"""

import inspect
import runpy
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.api.routes import admin_users
from app.api.routes import auth as auth_routes
from app.models import FREE_PLAN_SLUG
from app.repositories.auth import UserRepository
from app.services.projects import ProjectValidationError, limits_for_user


def test_both_registration_paths_assign_the_free_plan() -> None:
    """Email signup and Google signup have to behave identically here."""
    for creator in (UserRepository.add, UserRepository.add_from_google):
        src = inspect.getsource(creator)
        assert "self._free_plan()" in src, creator.__name__


def test_the_free_plan_is_attached_as_a_relationship() -> None:
    """Setting only the id would leave the caller with a lazy load.

    The request keeps using the new user (session response, /me payload) and a
    lazy ``current_plan`` load under async SQLAlchemy raises instead of
    querying.
    """
    src = inspect.getsource(UserRepository.add)
    assert "user.current_plan = await self._free_plan()" in src
    assert FREE_PLAN_SLUG in inspect.getsource(UserRepository._free_plan)


def test_limits_still_refuse_an_account_without_a_plan() -> None:
    class _PlanlessUser:
        current_plan = None

    with pytest.raises(ProjectValidationError):
        limits_for_user(_PlanlessUser())


def test_usage_endpoints_report_a_missing_plan_instead_of_crashing() -> None:
    """An unhandled ProjectValidationError here is a 500 on the dashboard."""
    for source in (
        inspect.getsource(auth_routes.get_usage),
        inspect.getsource(admin_users._build_usage_response),
    ):
        assert "except ProjectValidationError" in source
        assert "HTTP_409_CONFLICT" in source


def test_migration_backfills_planless_accounts() -> None:
    migration = runpy.run_path(
        str(
            Path(__file__).resolve().parents[1]
            / "migrations/versions/20260914_0052_backfill_free_plan_for_users.py"
        )
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE subscription_plans "
                "(id TEXT PRIMARY KEY, slug TEXT NOT NULL)"
            )
        )
        connection.execute(
            sa.text("CREATE TABLE users (id TEXT PRIMARY KEY, current_plan_id TEXT)")
        )
        connection.execute(
            sa.text(
                "INSERT INTO subscription_plans (id, slug) "
                "VALUES ('free-id', 'start'), ('paid-id', 'pro')"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO users (id, current_plan_id) "
                "VALUES ('planless', NULL), ('paying', 'paid-id')"
            )
        )

        operations = Operations(MigrationContext.configure(connection))
        migration["upgrade"].__globals__["op"] = operations
        migration["upgrade"]()

        rows = dict(
            connection.execute(sa.text("SELECT id, current_plan_id FROM users")).all()
        )

    assert rows["planless"] == "free-id"
    # A paying account keeps the plan it paid for.
    assert rows["paying"] == "paid-id"

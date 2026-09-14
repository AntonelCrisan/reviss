"""Paid capacity packs: they raise the cycle limits, and nothing else."""

from decimal import Decimal
from types import SimpleNamespace

from app.services.addons import AddonBalance, attach_addon_balance, balance_of
from app.services.ai_credits import (
    _addon_cost_headroom,
    _max_cost_usd_per_cycle,
    monthly_ai_credits,
    monthly_ocr_pages,
)
from app.services.projects import limits_for_user


def _user(balance: AddonBalance | None = None) -> SimpleNamespace:
    user = SimpleNamespace(
        current_plan=SimpleNamespace(
            slug="focus",
            active_project_limit=8,
            monthly_material_limit=64,
            monthly_page_limit=1000,
            files_per_project_limit=10,
            file_size_limit_mb=25,
            project_size_limit_mb=100,
            estimated_page_limit=200,
            initial_flashcard_limit=40,
            quiz_questions_per_quiz=10,
            quizzes_per_project_limit=6,
            allow_scanned_documents=True,
            monthly_ai_credits=60,
            monthly_ocr_pages=200,
            max_openai_cost_usd_per_cycle=Decimal("6.00"),
        )
    )
    if balance is not None:
        attach_addon_balance(user, balance)
    return user


# --- the safe default ------------------------------------------------------


def test_a_user_without_a_loaded_balance_gets_plan_limits() -> None:
    """Forgetting to load the balance must not grant unpaid capacity."""
    assert balance_of(SimpleNamespace()).is_empty

    limits = limits_for_user(_user())

    assert limits.active_projects == 8
    assert limits.monthly_materials == 64
    assert limits.monthly_page_limit == 1000


# --- capacity ---------------------------------------------------------------


def test_packs_add_to_the_plan_rather_than_replacing_it() -> None:
    user = _user(AddonBalance(projects=5, materials=50, pages=250))

    limits = limits_for_user(user)

    assert limits.active_projects == 8 + 5
    assert limits.monthly_materials == 64 + 50
    assert limits.monthly_page_limit == 1000 + 250


def test_per_item_caps_are_not_for_sale() -> None:
    """A pack buys volume for the cycle, not bigger individual uploads."""
    user = _user(AddonBalance(projects=5, materials=50, pages=250))

    limits = limits_for_user(user)

    assert limits.file_mb == 25
    assert limits.files_per_project == 10
    assert limits.estimated_pages == 200
    assert limits.quizzes_per_project == 6


def test_ai_credits_and_ocr_pages_add_up() -> None:
    user = _user(AddonBalance(ai_credits=30, ocr_pages=100))

    assert monthly_ai_credits(user) == 60 + 30
    assert monthly_ocr_pages(user) == 200 + 100


# --- spend ceiling ----------------------------------------------------------


def test_buying_credits_also_buys_spend_headroom() -> None:
    """Credits are useless if the cost ceiling still refuses to spend them.

    The plan implies $6 for 60 credits, so 30 bought credits have to lift the
    ceiling by $3 - otherwise a customer pays for capacity the guard blocks.
    """
    user = _user(AddonBalance(ai_credits=30))

    assert _addon_cost_headroom(user) == Decimal("3.00")
    assert _max_cost_usd_per_cycle(user) == Decimal("9.00")


def test_no_credits_bought_means_no_extra_headroom() -> None:
    user = _user(AddonBalance(projects=5))

    assert _addon_cost_headroom(user) == Decimal("0")
    assert _max_cost_usd_per_cycle(user) == Decimal("6.00")


def test_a_plan_without_credits_grants_no_headroom() -> None:
    """Never divide by zero to invent an unbounded allowance."""
    user = _user(AddonBalance(ai_credits=30))
    user.current_plan.monthly_ai_credits = 0

    assert _addon_cost_headroom(user) == Decimal("0")


def test_a_plan_with_no_ceiling_configured_grants_no_headroom() -> None:
    user = _user(AddonBalance(ai_credits=30))
    user.current_plan.max_openai_cost_usd_per_cycle = None

    assert _addon_cost_headroom(user) == Decimal("0")


# --- balance shape ----------------------------------------------------------


def test_an_empty_balance_reads_as_empty() -> None:
    assert AddonBalance().is_empty
    assert not AddonBalance(pages=1).is_empty

"""Stripe's own checkout page speaks the language the account chose."""

from types import SimpleNamespace

from app.core.i18n import SUPPORTED_LANGUAGES
from app.services.stripe_payments import (
    STRIPE_CHECKOUT_LOCALES,
    _checkout_locale,
)


def _user(language: object):
    return SimpleNamespace(language_preference=language)


# --- the language that is actually sent -------------------------------------


def test_each_account_language_reaches_stripe() -> None:
    for language in ("ro", "en", "fr"):
        assert _checkout_locale(_user(language)) == language


def test_a_regional_tag_is_reduced_to_its_language() -> None:
    """Stripe knows "ro", not "ro-RO", and rejects what it does not know."""
    assert _checkout_locale(_user("ro-RO")) == "ro"
    assert _checkout_locale(_user("RO")) == "ro"


def test_a_missing_preference_still_produces_a_valid_locale() -> None:
    """A checkout must never fail over a language setting."""
    for value in (None, "", "  ", 123, object()):
        assert _checkout_locale(_user(value)) in STRIPE_CHECKOUT_LOCALES


# --- the guard --------------------------------------------------------------


def test_every_language_the_app_offers_is_one_stripe_knows() -> None:
    """A language Stripe does not know is a 400 from Stripe, not a fallback:
    checkout would stop working entirely rather than look wrong."""
    assert set(SUPPORTED_LANGUAGES) <= STRIPE_CHECKOUT_LOCALES


def test_an_unknown_language_would_hand_the_choice_to_the_browser() -> None:
    """The guard only bites once the app adds a language Stripe lacks."""
    assert "auto" in STRIPE_CHECKOUT_LOCALES
    assert "klingon" not in STRIPE_CHECKOUT_LOCALES


# --- what actually reaches Stripe -------------------------------------------


def _captured_payload(build) -> dict:
    """Run a session builder with the HTTP call replaced by a recorder."""
    import asyncio

    from app.services.stripe_payments import StripeClient

    client = StripeClient.__new__(StripeClient)
    sent: dict = {}

    def record(_method, _path, data):
        sent.update(data)
        return {"id": "cs_test"}

    client._request = record  # type: ignore[method-assign]
    asyncio.run(build(client))
    return sent


def test_a_subscription_checkout_carries_the_locale() -> None:
    import uuid
    from decimal import Decimal

    user = SimpleNamespace(id=uuid.uuid4(), language_preference="fr")
    plan = SimpleNamespace(
        id=uuid.uuid4(),
        slug="focus",
        stripe_price_id="price_1",
        price_ron=Decimal("79.00"),
    )

    sent = _captured_payload(
        lambda client: client.create_checkout_session(
            user=user,
            plan=plan,
            customer_id="cus_1",
            success_url="https://x.invalid/ok",
            cancel_url="https://x.invalid/no",
        )
    )

    assert sent["locale"] == "fr"


def test_an_extra_capacity_checkout_carries_it_too() -> None:
    """The one-off basket is a separate builder, so it needs its own proof."""
    import uuid

    user = SimpleNamespace(id=uuid.uuid4(), language_preference="en")

    sent = _captured_payload(
        lambda client: client.create_addon_checkout_session(
            user=user,
            purchase_id=uuid.uuid4(),
            line_items=[("price_extra", 10)],
            customer_id="cus_1",
            success_url="https://x.invalid/ok",
            cancel_url="https://x.invalid/no",
        )
    )

    assert sent["locale"] == "en"
    assert sent["mode"] == "payment"

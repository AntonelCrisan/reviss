"""Localised plan copy and legal documents, with Romanian as the fallback."""

import uuid
from types import SimpleNamespace

from app.api.routes.plans import (
    TRANSLATABLE_PLAN_FIELDS,
    _feature_labels,
    _plan_overrides,
)


def _feature(label: str, translations: dict[str, str]) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        label=label,
        translations=[
            SimpleNamespace(locale=locale, label=text)
            for locale, text in translations.items()
        ],
    )


def _translation(locale: str, **fields: str | None) -> SimpleNamespace:
    values = dict.fromkeys(TRANSLATABLE_PLAN_FIELDS)
    values.update(fields)
    return SimpleNamespace(locale=locale, **values)


def _plan(translations=(), features=()) -> SimpleNamespace:
    return SimpleNamespace(
        slug="focus",
        translations=list(translations),
        features=list(features),
    )


# --- plan copy --------------------------------------------------------------


def test_romanian_needs_no_lookup() -> None:
    """Romanian is the stored original, so it is never overridden."""
    plan = _plan(translations=[_translation("ro", name="Gresit")])

    assert _plan_overrides(plan, "ro") == {}


def test_a_missing_translation_falls_back_to_romanian() -> None:
    plan = _plan(translations=[_translation("en", name="Focus EN")])

    assert _plan_overrides(plan, "fr") == {}


def test_only_filled_fields_are_overridden() -> None:
    """A half-written translation must not blank out the Romanian text.

    Anything left empty has to fall through, otherwise a partly translated
    plan would render with gaps where the original copy used to be.
    """
    plan = _plan(
        translations=[
            _translation(
                "en",
                name="Focus",
                description="Best value for active students.",
                storage="",
                ai_level="   ",
                conditions=None,
            )
        ]
    )

    overrides = _plan_overrides(plan, "en")

    assert overrides == {
        "name": "Focus",
        "description": "Best value for active students.",
    }
    for blank in ("storage", "ai_level", "conditions"):
        assert blank not in overrides


def test_every_translatable_field_can_be_overridden() -> None:
    filled = {field: f"{field}-en" for field in TRANSLATABLE_PLAN_FIELDS}
    plan = _plan(translations=[_translation("en", **filled)])

    overrides = _plan_overrides(plan, "en")

    assert set(overrides) == set(TRANSLATABLE_PLAN_FIELDS)


def test_prices_and_limits_are_not_translatable() -> None:
    """Numbers and identifiers mean the same in every language."""
    for field in ("price_ron", "slug", "stripe_price_id", "monthly_ai_credits"):
        assert field not in TRANSLATABLE_PLAN_FIELDS


# --- plan features ----------------------------------------------------------


def test_feature_labels_are_translated_per_feature() -> None:
    translated = _feature("Chat AI contextual", {"en": "Contextual AI chat"})
    untranslated = _feature("Rezumate AI", {})
    plan = _plan(features=[translated, untranslated])

    labels = _feature_labels(plan, "en")

    assert labels[translated.id] == "Contextual AI chat"
    # Left out entirely, so the caller keeps the Romanian label.
    assert untranslated.id not in labels


def test_a_blank_feature_translation_is_ignored() -> None:
    feature = _feature("Rezumate AI", {"en": "   "})
    plan = _plan(features=[feature])

    assert _feature_labels(plan, "en") == {}


def test_feature_labels_are_skipped_for_romanian() -> None:
    feature = _feature("Rezumate AI", {"en": "AI summaries"})
    plan = _plan(features=[feature])

    assert _feature_labels(plan, "ro") == {}

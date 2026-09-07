"""Configurable single-quiz generation.

Quizzes are requested one at a time with a chosen difficulty, question count and
mix of question types. These tests pin the rules the AI output has to satisfy
before it is persisted, because the answering UI cannot render or score a
malformed matching pair or a broken word order.
"""

import pydantic
import pytest

from app.models.study_project import QUIZ_COMPLEXITIES, QUIZ_QUESTION_TYPES
from app.schemas.projects import QuizGenerationRequest
from app.services.projects import (
    ProjectValidationError,
    _count_cloze_gaps,
    _distribute_question_types,
    _generated_option_sort_order,
    _validate_generated_quiz_options,
    _validate_generated_single_quiz,
    _validate_quiz_configuration,
    build_reviss_single_quiz_prompt,
)


def _options(*items):
    """Build option payloads with every key the schema requires."""
    return [
        {
            "label": item.get("label", "x"),
            "is_correct": item.get("is_correct", False),
            "match_label": item.get("match_label"),
            "position": item.get("position"),
        }
        for item in items
    ]


# --- configuration ----------------------------------------------------------


def test_configuration_is_capped_by_the_plan() -> None:
    with pytest.raises(ProjectValidationError, match="maximum 8 intrebari"):
        _validate_quiz_configuration(
            complexity="medium",
            question_count=20,
            question_types=["single_choice"],
            max_questions=8,
        )


def test_configuration_needs_at_least_one_question_per_type() -> None:
    with pytest.raises(ProjectValidationError, match="cel putin egal"):
        _validate_quiz_configuration(
            complexity="medium",
            question_count=2,
            question_types=["single_choice", "matching", "ordering"],
            max_questions=20,
        )


def test_configuration_rejects_unknown_values() -> None:
    with pytest.raises(ProjectValidationError, match="Dificultatea"):
        _validate_quiz_configuration(
            complexity="impossible",
            question_count=5,
            question_types=["single_choice"],
            max_questions=20,
        )
    with pytest.raises(ProjectValidationError, match="nu este suportat"):
        _validate_quiz_configuration(
            complexity="low",
            question_count=5,
            question_types=["essay"],
            max_questions=20,
        )
    with pytest.raises(ProjectValidationError, match="cel putin un tip"):
        _validate_quiz_configuration(
            complexity="low",
            question_count=5,
            question_types=[],
            max_questions=20,
        )


def test_configuration_dedupes_and_normalises() -> None:
    complexity, count, types = _validate_quiz_configuration(
        complexity="  EXAM ",
        question_count=6,
        question_types=["matching", "Single_Choice", "matching"],
        max_questions=12,
    )
    assert complexity == "exam"
    assert count == 6
    # Canonical order, so the prompt distribution is deterministic.
    assert types == ["single_choice", "matching"]


def test_exam_is_a_supported_difficulty() -> None:
    assert QUIZ_COMPLEXITIES == ("low", "medium", "high", "exam")


# --- distribution -----------------------------------------------------------


def test_distribution_always_totals_the_requested_count() -> None:
    for count in range(4, 20):
        distribution = _distribute_question_types(
            count, ["single_choice", "multiple_choice", "matching", "ordering"]
        )
        assert sum(distribution.values()) == count
        # No chosen type may be dropped entirely.
        assert all(value >= 1 for value in distribution.values())


def test_distribution_covers_every_chosen_type() -> None:
    # One question per type is the smallest count that can cover them all.
    distribution = _distribute_question_types(
        len(QUIZ_QUESTION_TYPES), list(QUIZ_QUESTION_TYPES)
    )
    assert set(distribution) == set(QUIZ_QUESTION_TYPES)


# --- generated option validation -------------------------------------------


def test_single_choice_needs_exactly_one_correct_option() -> None:
    with pytest.raises(ProjectValidationError, match="exact un raspuns corect"):
        _validate_generated_quiz_options(
            question_index=1,
            question_type="single_choice",
            options=_options(
                {"label": "a", "is_correct": True},
                {"label": "b", "is_correct": True},
                {"label": "c"},
                {"label": "d"},
            ),
        )


def test_multiple_choice_needs_two_correct_and_two_wrong() -> None:
    with pytest.raises(ProjectValidationError, match="cel putin doua raspunsuri"):
        _validate_generated_quiz_options(
            question_index=2,
            question_type="multiple_choice",
            options=_options(
                {"label": "a", "is_correct": True},
                {"label": "b"},
                {"label": "c"},
                {"label": "d"},
            ),
        )
    with pytest.raises(ProjectValidationError, match="toate optiunile corecte"):
        _validate_generated_quiz_options(
            question_index=2,
            question_type="multiple_choice",
            options=_options(
                {"label": "a", "is_correct": True},
                {"label": "b", "is_correct": True},
            ),
        )


def test_matching_rejects_incomplete_or_ambiguous_pairs() -> None:
    with pytest.raises(ProjectValidationError, match="pereche incompleta"):
        _validate_generated_quiz_options(
            question_index=3,
            question_type="matching",
            options=_options(
                {"label": "enzima", "match_label": "rol"},
                {"label": "substrat"},
            ),
        )
    # A duplicated right-hand item makes the association unanswerable.
    with pytest.raises(ProjectValidationError, match="duplicate"):
        _validate_generated_quiz_options(
            question_index=3,
            question_type="matching",
            options=_options(
                {"label": "a", "match_label": "same"},
                {"label": "b", "match_label": "same"},
            ),
        )


def test_matching_accepts_a_clean_pair_set() -> None:
    _validate_generated_quiz_options(
        question_index=4,
        question_type="matching",
        options=_options(
            {"label": "enzima", "match_label": "cataliza"},
            {"label": "hormon", "match_label": "semnalizare"},
            {"label": "anticorp", "match_label": "aparare"},
        ),
    )


def test_ordering_requires_a_complete_position_sequence() -> None:
    with pytest.raises(ProjectValidationError, match="fara poziţie"):
        _validate_generated_quiz_options(
            question_index=5,
            question_type="ordering",
            options=_options(
                {"label": "Celula", "position": 1},
                {"label": "este"},
            ),
        )
    # A gap or a duplicate would leave the sentence unorderable.
    with pytest.raises(ProjectValidationError, match="poziţiile 1..3"):
        _validate_generated_quiz_options(
            question_index=5,
            question_type="ordering",
            options=_options(
                {"label": "Celula", "position": 1},
                {"label": "este", "position": 1},
                {"label": "vie", "position": 3},
            ),
        )


def test_ordering_accepts_a_full_sequence() -> None:
    _validate_generated_quiz_options(
        question_index=6,
        question_type="ordering",
        options=_options(
            {"label": "Celula", "position": 1},
            {"label": "este", "position": 2},
            {"label": "unitatea", "position": 3},
            {"label": "de baza", "position": 4},
        ),
    )


def test_every_type_rejects_a_blank_label() -> None:
    for question_type in QUIZ_QUESTION_TYPES:
        with pytest.raises(ProjectValidationError, match="optiune fara text"):
            _validate_generated_quiz_options(
                question_index=7,
                question_type=question_type,
                options=_options(
                    {"label": "   ", "is_correct": True, "position": 1},
                    {"label": "b", "position": 2},
                ),
            )


# --- prompt -----------------------------------------------------------------


def test_prompt_only_asks_for_the_chosen_types() -> None:
    prompt = build_reviss_single_quiz_prompt(
        project_name="Farmacologie",
        subject_name="Farmacologie",
        institution_name="UMF",
        summary="Rezumat.",
        flashcard_context="",
        material_markdown="Material.",
        complexity="high",
        question_count=4,
        question_types=["matching", "ordering"],
        target_language="ro",
    )

    assert "REGULI matching" in prompt
    assert "REGULI ordering" in prompt
    assert "REGULI single_choice" not in prompt
    assert "REGULI multiple_choice" not in prompt
    assert "exact 2 intrebari de tip matching" in prompt
    assert "Dificultate: high" in prompt
    # Every option carries all four keys, so the model never has to choose
    # between competing option shapes.
    assert '"match_label": null' in prompt
    assert '"position": null' in prompt


def test_prompt_rejects_an_unknown_difficulty() -> None:
    with pytest.raises(ValueError, match="complexity necunoscuta"):
        build_reviss_single_quiz_prompt(
            project_name="P",
            subject_name="S",
            institution_name="I",
            summary="R",
            flashcard_context="",
            material_markdown="M",
            complexity="nightmare",
            question_count=4,
            question_types=["single_choice"],
            target_language="ro",
        )


# --- generated payload ------------------------------------------------------


def _payload(questions):
    """A response shaped exactly like the reviss.quiz.v2 schema."""
    return {
        "schema_version": "reviss.quiz.v2",
        "quiz": {
            "title": "Quiz recapitulativ",
            "description": "Un quiz scurt.",
            "complexity": "medium",
            "questions": questions,
        },
    }


def _question(question_type, options, prompt=None):
    return {
        "prompt": prompt if prompt is not None else f"Intrebare {question_type}?",
        "type": question_type,
        "explanation": "Pentru ca da.",
        "options": options,
    }


def test_a_schema_conforming_payload_is_accepted() -> None:
    """This is the regression: the batch validator rejected every v2 payload."""
    _validate_generated_single_quiz(
        _payload(
            [
                _question(
                    "single_choice",
                    _options(
                        {"label": "Corect", "is_correct": True},
                        {"label": "Gresit"},
                    ),
                ),
                _question(
                    "multiple_choice",
                    _options(
                        {"label": "A", "is_correct": True},
                        {"label": "B", "is_correct": True},
                        {"label": "C"},
                    ),
                ),
                _question(
                    "matching",
                    _options(
                        {
                            "label": "Stanga 1",
                            "match_label": "Dreapta 1",
                            "is_correct": True,
                        },
                        {
                            "label": "Stanga 2",
                            "match_label": "Dreapta 2",
                            "is_correct": True,
                        },
                    ),
                ),
                _question(
                    "ordering",
                    _options(
                        {"label": "Propozitia", "position": 1, "is_correct": True},
                        {"label": "corecta", "position": 2, "is_correct": True},
                    ),
                ),
            ]
        )
    )


def test_a_batch_era_payload_is_rejected() -> None:
    """The old `quizzes` list is no longer a valid response."""
    with pytest.raises(ProjectValidationError, match="nu contine un quiz valid"):
        _validate_generated_single_quiz(
            {"quizzes": [{"title": "Vechi", "questions": []}]}
        )


def test_a_quiz_without_questions_is_rejected() -> None:
    with pytest.raises(ProjectValidationError, match="nu contine intrebari"):
        _validate_generated_single_quiz(_payload([]))


def test_a_quiz_without_a_title_is_rejected() -> None:
    payload = _payload(
        [
            _question(
                "single_choice",
                _options({"label": "A", "is_correct": True}, {"label": "B"}),
            )
        ]
    )
    payload["quiz"]["title"] = "   "
    with pytest.raises(ProjectValidationError, match="nu are titlu"):
        _validate_generated_single_quiz(payload)


def test_a_question_without_a_prompt_is_rejected() -> None:
    with pytest.raises(ProjectValidationError, match="Intrebarea 1 nu are text"):
        _validate_generated_single_quiz(
            _payload(
                [
                    _question(
                        "single_choice",
                        _options({"label": "A", "is_correct": True}, {"label": "B"}),
                        prompt="  ",
                    )
                ]
            )
        )


def test_an_unknown_question_type_is_rejected() -> None:
    with pytest.raises(ProjectValidationError, match="tip necunoscut"):
        _validate_generated_single_quiz(
            _payload(
                [
                    _question(
                        "essay",
                        _options({"label": "A", "is_correct": True}, {"label": "B"}),
                    )
                ]
            )
        )


def test_a_single_option_question_is_rejected() -> None:
    with pytest.raises(ProjectValidationError, match="cel putin doua optiuni"):
        _validate_generated_single_quiz(
            _payload(
                [
                    _question(
                        "single_choice", _options({"label": "A", "is_correct": True})
                    )
                ]
            )
        )


def test_per_type_invariants_still_apply_to_the_payload() -> None:
    """A broken word order has to be caught before it reaches the database."""
    with pytest.raises(ProjectValidationError, match="poziţiile 1..2"):
        _validate_generated_single_quiz(
            _payload(
                [
                    _question(
                        "ordering",
                        _options(
                            {"label": "unu", "position": 1, "is_correct": True},
                            {"label": "doi", "position": 5, "is_correct": True},
                        ),
                    )
                ]
            )
        )


def test_too_many_questions_are_rejected() -> None:
    question = _question(
        "single_choice", _options({"label": "A", "is_correct": True}, {"label": "B"})
    )
    with pytest.raises(ProjectValidationError, match="prea multe elemente"):
        _validate_generated_single_quiz(_payload([question] * 200))


# --- cloze ------------------------------------------------------------------

CLOZE_PROMPT = "Autonomia este capacitatea de a elabora ____ pe baza valorilor ____."


def _cloze_options(
    *, gaps=("norme si reguli", "interiorizate"), distractors=("sanctiuni",)
):
    options = [
        {"label": label, "is_correct": True, "position": index}
        for index, label in enumerate(gaps, start=1)
    ]
    options += [{"label": label, "is_correct": False} for label in distractors]
    return _options(*options)


def test_cloze_gaps_are_counted_from_the_prompt() -> None:
    assert _count_cloze_gaps(CLOZE_PROMPT) == 2
    assert _count_cloze_gaps("Fara goluri.") == 0
    # The model is not reliable about the marker width.
    assert _count_cloze_gaps("Un ___ si un ______.") == 2


def test_a_well_formed_cloze_question_is_accepted() -> None:
    _validate_generated_quiz_options(
        question_index=1,
        question_type="cloze",
        options=_cloze_options(),
        prompt=CLOZE_PROMPT,
    )


def test_cloze_needs_a_gap_in_the_prompt() -> None:
    with pytest.raises(ProjectValidationError, match="niciun gol"):
        _validate_generated_quiz_options(
            question_index=1,
            question_type="cloze",
            options=_cloze_options(gaps=("norme si reguli",)),
            prompt="Propozitie fara gol.",
        )


def test_cloze_needs_one_correct_word_per_gap() -> None:
    with pytest.raises(ProjectValidationError, match="fiecare din cele 2"):
        _validate_generated_quiz_options(
            question_index=1,
            question_type="cloze",
            options=_cloze_options(gaps=("norme si reguli",)),
            prompt=CLOZE_PROMPT,
        )


def test_cloze_gap_numbers_start_at_one_and_have_no_holes() -> None:
    options = _options(
        {"label": "unu", "is_correct": True, "position": 1},
        {"label": "doi", "is_correct": True, "position": 3},
        {"label": "distractor", "is_correct": False},
    )
    with pytest.raises(ProjectValidationError, match="numerotate de la 1"):
        _validate_generated_quiz_options(
            question_index=1,
            question_type="cloze",
            options=options,
            prompt=CLOZE_PROMPT,
        )


def test_cloze_needs_at_least_one_distractor() -> None:
    """Without a distractor the student would just place every word given."""
    with pytest.raises(ProjectValidationError, match="cuvant distractor"):
        _validate_generated_quiz_options(
            question_index=1,
            question_type="cloze",
            options=_cloze_options(distractors=()),
            prompt=CLOZE_PROMPT,
        )


def test_cloze_rejects_duplicate_words() -> None:
    with pytest.raises(ProjectValidationError, match="optiuni duplicate"):
        _validate_generated_quiz_options(
            question_index=1,
            question_type="cloze",
            options=_cloze_options(distractors=("norme si reguli",)),
            prompt=CLOZE_PROMPT,
        )


def test_a_cloze_payload_passes_the_whole_validator() -> None:
    payload = {
        "schema_version": "reviss.quiz.v2",
        "quiz": {
            "title": "Autonomie",
            "description": "d",
            "complexity": "medium",
            "questions": [
                {
                    "prompt": CLOZE_PROMPT,
                    "type": "cloze",
                    "explanation": "e",
                    "options": _cloze_options(),
                }
            ],
        },
    }
    _validate_generated_single_quiz(payload)


def test_cloze_sort_order_is_the_gap_number_and_zero_for_distractors() -> None:
    assert (
        _generated_option_sort_order(
            question_type="cloze", option_index=0, position=2, is_correct=True
        )
        == 2
    )
    assert (
        _generated_option_sort_order(
            question_type="cloze", option_index=5, position=None, is_correct=False
        )
        == 0
    )


def test_ordering_sort_order_stays_zero_based() -> None:
    assert (
        _generated_option_sort_order(
            question_type="ordering", option_index=7, position=1, is_correct=True
        )
        == 0
    )


def test_choice_sort_order_follows_the_generated_order() -> None:
    assert (
        _generated_option_sort_order(
            question_type="single_choice",
            option_index=3,
            position=None,
            is_correct=True,
        )
        == 3
    )


def test_the_prompt_describes_the_cloze_rules_when_chosen() -> None:
    prompt = build_reviss_single_quiz_prompt(
        project_name="P",
        subject_name="S",
        institution_name="I",
        summary="rezumat",
        flashcard_context="",
        material_markdown="material",
        complexity="medium",
        question_count=2,
        question_types=["cloze"],
        target_language="ro",
    )
    assert "REGULI cloze" in prompt
    assert "____" in prompt
    # Rules for types that were not chosen must stay out of the prompt.
    assert "REGULI matching" not in prompt


# --- request schema ---------------------------------------------------------


def test_the_request_schema_accepts_every_declared_question_type() -> None:
    """This is the regression: a new type 422'd because the schema listed four."""
    for question_type in QUIZ_QUESTION_TYPES:
        request = QuizGenerationRequest(
            complexity="medium", question_count=4, question_types=[question_type]
        )
        assert request.question_types == [question_type]


def test_the_request_schema_accepts_all_types_at_once() -> None:
    request = QuizGenerationRequest(
        complexity="exam",
        question_count=len(QUIZ_QUESTION_TYPES),
        question_types=list(QUIZ_QUESTION_TYPES),
    )
    assert len(request.question_types) == len(QUIZ_QUESTION_TYPES)


def test_the_request_schema_accepts_every_declared_difficulty() -> None:
    for complexity in QUIZ_COMPLEXITIES:
        request = QuizGenerationRequest(
            complexity=complexity, question_count=2, question_types=["single_choice"]
        )
        assert request.complexity == complexity


def test_the_request_schema_still_rejects_an_unknown_type() -> None:
    with pytest.raises(pydantic.ValidationError):
        QuizGenerationRequest(
            complexity="medium", question_count=2, question_types=["essay"]
        )


def test_the_request_schema_needs_at_least_one_type() -> None:
    with pytest.raises(pydantic.ValidationError):
        QuizGenerationRequest(complexity="medium", question_count=2, question_types=[])

"""Regression coverage for quiz quality and exact summary remediation."""

import copy
import json
import uuid
from types import SimpleNamespace

import pytest

from app.models import StudyProject
from app.schemas.projects import StudyProjectQuizQuestionResponse
from app.services.projects import (
    STUDY_PACK_MAX_PARTS,
    ProjectValidationError,
    StudyProjectService,
    _estimated_reading_minutes,
    _keyword_paragraph_index,
    _merge_study_pack_parts,
    _plan_quiz_batches,
    _previous_quiz_concepts,
    _quiz_summary_context,
    _repair_quiz_review_references,
    _run_all_or_cancel,
    _single_quiz_schema,
    _split_study_material,
    _split_summary_blocks,
    _strategies_pending,
    _summary_reference_blocks,
    _validate_generated_single_quiz,
    _validate_quiz_answer_lengths,
    _validate_study_pack_anchors,
    _validate_study_pack_part,
    build_reviss_single_quiz_prompt,
    limits_for_user,
    plan_reviss_study_pack,
)

SUMMARY = (
    "## Etica\n\n"
    "**Morala** se formează prin învățare socială.\n\n"
    "### Sancțiuni\n\n"
    "Sancțiunile juridice pot influența comportamentul.\n\n"
    "- Normele morale ghidează conduita.\n"
    "- Normele juridice sunt stabilite prin lege.\n\n"
    "## Distincții\n\n"
    "Conceptele diferă prin sursa regulilor."
)


def quiz_payload():
    return {
        "schema_version": "reviss.quiz.v2",
        "quiz": {
            "title": "Formarea moralei",
            "description": "Un exercițiu despre morală.",
            "complexity": "medium",
            "questions": [
                {
                    "prompt": "Cum se formează morala?",
                    "type": "single_choice",
                    "concept": "Formarea moralei",
                    "explanation": (
                        "Morala se învață social, nu exclusiv prin sancțiuni."
                    ),
                    "review_section": "Etica",
                    "review_paragraph_index": 1,
                    "review_anchor_text": "Morala se formează prin învățare socială.",
                    "review_advice": (
                        "Explică din memorie cum se formează morala. "
                        "Ce rol are învățarea socială?"
                    ),
                    "options": [
                        {
                            "label": label,
                            "is_correct": i == 0,
                            "match_label": None,
                            "position": None,
                        }
                        for i, label in enumerate(
                            [
                                "Prin învățare socială",
                                "Doar prin sancțiuni juridice",
                                "Exclusiv prin reguli impuse",
                                "Numai prin decizii administrative",
                            ]
                        )
                    ],
                }
            ],
        },
    }


def validate(payload, **kwargs):
    _validate_generated_single_quiz(
        payload,
        summary=SUMMARY,
        complexity="medium",
        question_count=1,
        question_types=["single_choice"],
        **kwargs,
    )


def test_reference_indices_agree_with_selection_blocks():
    blocks = _summary_reference_blocks(SUMMARY)
    assert [block["text"] for block in blocks] == _split_summary_blocks(SUMMARY)
    assert blocks[3]["section"] == "Etica / Sancțiuni"
    assert blocks[3]["paragraph_number"] == 2
    assert blocks[7]["section"] == "Distincții"
    assert blocks[7]["paragraph_number"] == 5
    context = [json.loads(line) for line in _quiz_summary_context(SUMMARY).splitlines()]
    assert [block["index"] for block in context] == [1, 3, 4, 5, 7]
    assert context[0]["text"].startswith("Morala se")
    validate(quiz_payload())


@pytest.mark.parametrize(
    "changes",
    [
        {"review_paragraph_index": 0},  # heading
        {"review_paragraph_index": -1},
        {"review_paragraph_index": 999},
        {"review_paragraph_index": True},
        {"review_paragraph_index": 3},  # real, but unrelated paragraph
        {"review_anchor_text": "Un citat inventat care nu există."},
        {"review_section": "Sancțiuni"},  # wrong section for the selected paragraph
        {"review_advice": ""},
        {"concept": ""},
    ],
)
def test_invalid_review_is_rejected_before_saving(changes):
    payload = quiz_payload()
    payload["quiz"]["questions"][0].update(changes)
    with pytest.raises(ProjectValidationError):
        validate(payload)


def test_requested_count_and_type_mix_are_validated():
    payload = quiz_payload()
    payload["quiz"]["questions"].append(copy.deepcopy(payload["quiz"]["questions"][0]))
    with pytest.raises(ProjectValidationError, match="exact 1"):
        validate(payload)
    payload = quiz_payload()
    payload["quiz"]["questions"][0]["type"] = "matching"
    with pytest.raises(ProjectValidationError, match="Distributia"):
        validate(payload)


def test_choice_labels_cannot_be_duplicates_with_different_case():
    payload = quiz_payload()
    payload["quiz"]["questions"][0]["options"][1]["label"] = "PRIN ÎNVĂȚARE SOCIALĂ"
    with pytest.raises(ProjectValidationError, match="duplicate"):
        validate(payload)


def choice(lengths, correct=(0,), kind="single_choice"):
    return {
        "type": kind,
        "options": [
            {"label": " ".join([f"termen{i}"] * length), "is_correct": i in correct}
            for i, length in enumerate(lengths)
        ],
    }


def test_systematic_longest_correct_answers_trigger_retry():
    questions = [choice([8, 6, 5, 7]) for _ in range(3)]
    with pytest.raises(ProjectValidationError, match="Tipar de lungime"):
        _validate_quiz_answer_lengths(questions)


def test_multiple_choice_correct_group_cannot_always_be_longest():
    questions = [choice([8, 8, 6, 7], (0, 1), "multiple_choice") for _ in range(3)]
    with pytest.raises(ProjectValidationError, match="Tipar de lungime"):
        _validate_quiz_answer_lengths(questions)


def test_equal_lengths_and_varied_ranks_do_not_trigger_false_positive():
    _validate_quiz_answer_lengths([choice([5, 5, 5, 5]) for _ in range(8)])
    _validate_quiz_answer_lengths(
        [
            choice([8, 6, 5, 7]),
            choice([5, 7, 8, 6]),
            choice([6, 8, 5, 7]),
        ]
    )
    _validate_quiz_answer_lengths(
        [
            choice([20, 1], kind="matching"),
            choice([20, 1], kind="ordering"),
        ]
    )


def test_single_extreme_length_cue_is_rejected():
    with pytest.raises(ProjectValidationError, match="disproportionat"):
        _validate_quiz_answer_lengths([choice([15, 3, 4, 5])])


def test_keywords_require_a_unique_body_anchor():
    assert _keyword_paragraph_index(SUMMARY, "Morala se formează") == 1
    assert _keyword_paragraph_index(SUMMARY, "Etica") is None
    assert _keyword_paragraph_index(SUMMARY, "Inventat") is None
    repeated = SUMMARY + "\n\nMorala se formează și prin experiență."
    assert _keyword_paragraph_index(repeated, "Morala se formează") is None
    payload = {
        "summary": {"content": SUMMARY},
        "keywords": [
            {
                "term": "Morala",
                "anchor_text": "Morala se formează",
            }
        ],
    }
    _validate_study_pack_anchors(payload)
    payload["keywords"][0]["anchor_text"] = "Etica"
    with pytest.raises(ProjectValidationError):
        _validate_study_pack_anchors(payload)


def test_saved_questions_and_response_preserve_review_fields():
    payload = quiz_payload()
    validate(payload)
    project = StudyProject(id=uuid.uuid4(), quizzes=[])
    service = StudyProjectService(session=None, settings=None)
    quiz = service._apply_generated_quiz(project, payload)
    question = quiz.questions[0]
    question.id = uuid.uuid4()
    for option in question.options:
        option.id = uuid.uuid4()
    response = StudyProjectQuizQuestionResponse.model_validate(question)
    assert response.review_paragraph_index == 1
    assert response.review_anchor_text == "Morala se formează prin învățare socială."
    assert response.review_section == "Etica"
    assert response.concept == "Formarea moralei"
    assert "memorie" in response.review_advice


def plan(**changes):
    fields = dict(
        slug="custom-school-plan",
        active_project_limit=0,
        monthly_material_limit=19,
        files_per_project_limit=4,
        file_size_limit_mb=7,
        project_size_limit_mb=28,
        estimated_page_limit=31,
        monthly_page_limit=0,
        initial_flashcard_limit=5,
        quiz_questions_per_quiz=17,
        quizzes_per_project_limit=9,
        allow_scanned_documents=True,
    )
    fields.update(changes)
    return SimpleNamespace(**fields)


def test_limits_come_from_database_fields_independently_of_slug():
    user = SimpleNamespace(current_plan=plan())
    limits = limits_for_user(user)
    assert limits.active_projects == 0
    assert limits.monthly_page_limit == 0
    assert limits.initial_flashcards == 5
    assert limits.quiz_questions_per_quiz == 17
    assert limits.quizzes_per_project == 9
    assert limits.allow_scanned_documents is True
    user.current_plan.quiz_questions_per_quiz = 23
    assert limits_for_user(user).quiz_questions_per_quiz == 23


@pytest.mark.parametrize(
    "changes",
    [
        {"file_size_limit_mb": None},
        {"quiz_questions_per_quiz": "8"},
        {"monthly_material_limit": -1},
        {"allow_scanned_documents": None},
        {"files_per_project_limit": True},
    ],
)
def test_invalid_plan_data_never_grants_hardcoded_allowances(changes):
    with pytest.raises(ProjectValidationError):
        limits_for_user(SimpleNamespace(current_plan=plan(**changes)))


def test_no_plan_does_not_grant_beginner_limits():
    with pytest.raises(ProjectValidationError, match="plan activ"):
        limits_for_user(SimpleNamespace(current_plan=None))


def test_small_database_flashcard_limit_is_respected_by_prompt():
    study_plan = plan_reviss_study_pack(
        project_name="P",
        subject_name="S",
        institution_name="I",
        material_markdown="Material",
        flashcard_count=5,
        target_language="ro",
    )
    assert len(study_plan.parts) == 1
    assert "exact 5 flashcarduri" in study_plan.parts[0].prompt
    assert study_plan.parts[0].flashcard_count == 5


def course(chapters, paragraph_chars=1_000, paragraphs=6):
    return "\n\n".join(
        f"## Capitolul {chapter}\n\n"
        + "\n\n".join(
            f"C{chapter}P{index} " + "x" * paragraph_chars
            for index in range(paragraphs)
        )
        for chapter in range(1, chapters + 1)
    )


def test_material_is_split_in_order_at_chapter_headings_without_losing_text():
    material = course(chapters=8)
    parts = _split_study_material(material)

    # Each chapter is near the target size, so each gets a part of its own.
    assert len(parts) == 8
    assert all(part.startswith("## Capitolul") for part in parts)
    # Nothing dropped, duplicated or reordered.
    assert "\n\n".join(parts) == material


def test_material_without_blank_lines_or_headings_is_still_split():
    material = " ".join(f"cuvant{index}" for index in range(12_000))
    parts = _split_study_material(material)

    assert len(parts) > 1
    assert " ".join(" ".join(part.split()) for part in parts) == material
    assert max(len(part) for part in parts) < len(material) / 2


def test_short_material_stays_one_part_and_huge_material_is_capped():
    assert _split_study_material("## Scurt\n\nUn paragraf.") == [
        "## Scurt\n\nUn paragraf."
    ]
    assert _split_study_material("   ") == []
    material = course(chapters=80)
    parts = _split_study_material(material)
    assert len(parts) == STUDY_PACK_MAX_PARTS
    # No part is left carrying the rest of the course.
    assert max(len(part) for part in parts) <= 1.2 * len(material) / len(parts)
    assert "\n\n".join(parts) == material


def test_study_pack_plan_spreads_flashcards_and_names_every_part():
    study_plan = plan_reviss_study_pack(
        project_name="P",
        subject_name="S",
        institution_name="I",
        material_markdown=course(chapters=8),
        flashcard_count=31,
        target_language="ro",
    )

    counts = [part.flashcard_count for part in study_plan.parts]
    assert sum(counts) == 31
    assert max(counts) - min(counts) <= 2
    for part in study_plan.parts:
        assert f"partea {part.number} din {len(study_plan.parts)}" in part.prompt
        # Every part sees the outline of the others.
        assert "Capitolul 1" in part.prompt and "Capitolul 8" in part.prompt
    assert "Capitolul 8" in study_plan.strategies_prompt
    assert "STRATEGII" in study_plan.combined_prompt()


@pytest.fixture
def quiz_generation_context(monkeypatch):
    from pathlib import Path
    from unittest.mock import AsyncMock, Mock

    import app.services.projects as service_module

    project = StudyProject(
        id=uuid.uuid4(),
        name="Etica",
        subject_name="Etica",
        institution_name="Facultate",
        generation_language="ro",
        quizzes=[],
    )
    project.summary = service_module.StudyProjectSummary(content=SUMMARY)
    user = SimpleNamespace(id=uuid.uuid4(), current_plan=plan())
    session = SimpleNamespace(
        commit=AsyncMock(),
        rollback=AsyncMock(),
        add=Mock(),
    )
    service = StudyProjectService(
        session=session,
        settings=SimpleNamespace(
            openai_quiz_model="test-model",
            openai_quiz_request_timeout_seconds=60,
        ),
    )
    service.get_project = AsyncMock(return_value=project)
    service._get_latest_generation_job = AsyncMock(
        return_value=SimpleNamespace(id=uuid.uuid4())
    )
    service._mark_generation_job_running = AsyncMock()
    service._ensure_generation_can_continue = AsyncMock()
    service._read_project_markdown = Mock(return_value=SUMMARY)
    service._build_single_quiz_prompt = Mock(return_value="Original quiz prompt")
    service._write_generation_prompt = Mock(return_value=Path("prompt.txt"))
    service._write_generation_response = Mock(return_value=Path("response.json"))
    service._mark_generation_job_completed = Mock(
        wraps=service._mark_generation_job_completed
    )
    service._notify_project_ready = AsyncMock()
    service._fail_generation_job = AsyncMock()
    service._apply_generated_quiz = Mock(wraps=service._apply_generated_quiz)
    credits = SimpleNamespace(
        determine_tier=AsyncMock(return_value="small"),
        ensure_can_consume=AsyncMock(return_value=1),
        charge=AsyncMock(),
    )
    monkeypatch.setattr(service_module, "AiCreditsService", lambda _: credits)
    monkeypatch.setattr(service_module, "_current_billing_window", AsyncMock())
    generator = SimpleNamespace(generate_json=AsyncMock())
    monkeypatch.setattr(service_module, "OpenAIStudyGenerator", lambda _: generator)
    return SimpleNamespace(
        service=service,
        project=project,
        user=user,
        session=session,
        credits=credits,
        generator=generator,
    )


def run_quiz_generation(context):
    import asyncio

    return asyncio.run(
        context.service.generate_single_quiz(
            user=context.user,
            project_id=context.project.id,
            complexity="medium",
            question_count=1,
            question_types=["single_choice"],
        )
    )


@pytest.mark.parametrize("retry_succeeds", [True, False])
@pytest.mark.parametrize(
    "first_failure", ["reference", "max_output_tokens", "invalid_json"]
)
def test_generation_retries_once_before_any_quiz_is_saved(
    quiz_generation_context, retry_succeeds, first_failure
):
    from app.services.openai_generation import OpenAIOutputError

    context = quiz_generation_context
    service, project = context.service, context.project
    bad = quiz_payload()
    bad["quiz"]["questions"][0]["review_anchor_text"] = (
        "Un citat inventat care nu există."
    )
    good = quiz_payload()
    first = (
        SimpleNamespace(payload=bad, input_tokens=100, output_tokens=200)
        if first_failure == "reference"
        else OpenAIOutputError(
            "Raspuns AI incomplet",
            reason=first_failure,
            input_tokens=100,
            output_tokens=200,
        )
    )
    context.generator.generate_json.side_effect = [
        first,
        SimpleNamespace(
            payload=good if retry_succeeds else bad,
            input_tokens=150,
            output_tokens=250,
            total_tokens=400,
        ),
    ]
    if retry_succeeds:
        run_quiz_generation(context)
        service._apply_generated_quiz.assert_called_once_with(project, good)
        assert len(project.quizzes) == 1
        assert project.quizzes[0].questions[0].review_paragraph_index == 1
        assert context.credits.charge.call_args.kwargs["input_tokens"] == 250
        assert context.credits.charge.call_args.kwargs["output_tokens"] == 450
        job = service._get_latest_generation_job.return_value
        assert job.total_tokens == 700
        context.session.commit.assert_awaited_once()
    else:
        with pytest.raises(ProjectValidationError):
            run_quiz_generation(context)
        service._apply_generated_quiz.assert_not_called()
        service._write_generation_response.assert_not_called()
        context.session.commit.assert_not_awaited()
        context.credits.charge.assert_not_awaited()
        service._fail_generation_job.assert_awaited_once()
    calls = context.generator.generate_json.call_args_list
    assert len(calls) == 2
    retry_prompt = calls[1].kwargs["prompt"]
    assert "REGENERARE OBLIGATORIE" in retry_prompt
    if first_failure == "reference":
        assert "Referinta de revizuire este invalida la intrebarea 1" in retry_prompt
        assert "CANDIDAT RESPINS" in retry_prompt
        assert bad["quiz"]["questions"][0]["review_anchor_text"] in retry_prompt
    expected_budget = 6000 if first_failure == "max_output_tokens" else 4000
    assert calls[1].kwargs["max_output_tokens"] == expected_budget
    assert "copy these verbatim" in calls[0].kwargs["instructions"]


LONG_SUMMARY = "\n\n".join(
    f"## Capitolul {chapter}\n\n"
    + "\n\n".join(
        f"Capitolul {chapter} paragraful {paragraph} descrie mecanismul numarul "
        f"{chapter}{paragraph}, " + "cu detalii examinabile despre concept " * 6
        for paragraph in range(1, 4)
    )
    for chapter in range(1, 7)
)


def body_blocks(summary):
    return [
        block for block in _summary_reference_blocks(summary)
        if block["kind"] != "heading"
    ]


def choice_question(block, name):
    return {
        "prompt": f"Ce descrie blocul {name}?",
        "type": "single_choice",
        "concept": f"Concept {name}",
        "explanation": "Explicatia arata de ce varianta A este cea corecta.",
        "review_section": block["section"],
        "review_paragraph_index": block["index"],
        "review_anchor_text": block["text"][:40],
        "review_advice": "Reconstruieste blocul din memorie. Ce mecanism descrie?",
        "options": [
            {
                "label": f"Varianta {letter}",
                "is_correct": letter == "A",
                "match_label": None,
                "position": None,
            }
            for letter in "ABCD"
        ],
    }


def test_long_summary_registry_is_sampled_across_the_whole_course():
    from app.services import projects as service_module

    summary = "\n\n".join(
        f"## Capitolul {chapter}\n\n" + f"Capitolul {chapter}: " + "text " * 400
        for chapter in range(1, 101)
    )
    context = service_module._quiz_summary_context(summary)
    sections = [json.loads(line)["section"] for line in context.splitlines()]

    assert len(context) <= service_module.QUIZ_PROMPT_SUMMARY_CHARS
    # Not just the first chapters that fit: the end of the course is there too.
    assert sections[0] == "Capitolul 1"
    assert int(sections[-1].split()[-1]) >= 97


def test_quiz_batches_share_types_evenly_and_split_the_summary_in_zones():
    batches = _plan_quiz_batches(
        summary=LONG_SUMMARY,
        complexity="medium",
        question_count=12,
        question_types=["single_choice", "multiple_choice", "matching", "cloze"],
    )

    assert len(batches) == 3
    for batch in batches:
        assert batch.type_counts == {
            "single_choice": 1,
            "multiple_choice": 1,
            "matching": 1,
            "cloze": 1,
        }
        # An easy quiz only shows a batch its own zone.
        assert batch.registry_indices == set(batch.zone_indices)
    zones = [batch.zone_indices for batch in batches]
    assert sum(zones, []) == [block["index"] for block in body_blocks(LONG_SUMMARY)]
    assert all(zones)
    assert batches[0].zone_sections[0] == "Capitolul 1"

    uneven = _plan_quiz_batches(
        summary=LONG_SUMMARY,
        complexity="exam",
        question_count=10,
        question_types=["single_choice"],
    )
    assert [batch.question_count for batch in uneven] == [4, 3, 3]
    # A hard quiz links chapters, so every batch sees the whole summary.
    all_indices = {block["index"] for block in body_blocks(LONG_SUMMARY)}
    assert all(batch.wide for batch in uneven)
    assert all(batch.registry_indices == all_indices for batch in uneven)


def test_short_quizzes_and_thin_summaries_stay_one_batch():
    assert len(
        _plan_quiz_batches(
            summary=LONG_SUMMARY,
            complexity="medium",
            question_count=4,
            question_types=["single_choice"],
        )
    ) == 1
    assert len(
        _plan_quiz_batches(
            summary=SUMMARY,
            complexity="medium",
            question_count=12,
            question_types=["single_choice"],
        )
    ) == 1


def test_batch_prompt_names_its_zone_and_shows_only_it_on_easy_quizzes():
    batches = _plan_quiz_batches(
        summary=LONG_SUMMARY,
        complexity="medium",
        question_count=8,
        question_types=["single_choice"],
    )
    second = batches[1]
    prompt = build_reviss_single_quiz_prompt(
        "Curs",
        "Curs",
        "Facultate",
        LONG_SUMMARY,
        "",
        LONG_SUMMARY,
        "medium",
        8,
        ["single_choice"],
        "ro",
        batch=second,
        batches=batches,
    )

    assert "LOTURI PARALELE" in prompt
    assert "Quizul complet are 8 intrebari, scrise in 2 loturi" in prompt
    assert "Exact 4 intrebari in acest lot" in prompt
    assert (
        f"ZONA TA (index {second.zone_indices[0]}-{second.zone_indices[-1]})"
        in prompt
    )
    registry = [
        json.loads(line.strip('"'))["index"]
        for line in prompt.splitlines()
        if line.strip('"').startswith('{"index"')
    ]
    assert registry == second.zone_indices


def run_batched_quiz(context, question_count):
    import asyncio

    return asyncio.run(
        context.service.generate_single_quiz(
            user=context.user,
            project_id=context.project.id,
            complexity="medium",
            question_count=question_count,
            question_types=["single_choice"],
        )
    )


def batched_quiz_context(context, responder):
    from unittest.mock import AsyncMock, Mock

    context.project.summary.content = LONG_SUMMARY
    context.service._build_single_quiz_prompt = Mock(
        side_effect=lambda **kwargs: f"lot {kwargs['batch'].number}"
    )
    context.generator.generate_json = AsyncMock(side_effect=responder)
    return _plan_quiz_batches(
        summary=LONG_SUMMARY,
        complexity="medium",
        question_count=8,
        question_types=["single_choice"],
    )


def test_new_quiz_is_told_the_concepts_earlier_quizzes_tested_in_its_zone():
    from app.models import StudyProjectQuiz, StudyProjectQuizQuestion

    def question(concept, index, sort_order, prompt="Intrebare?"):
        return StudyProjectQuizQuestion(
            prompt=prompt,
            question_type="single_choice",
            concept=concept,
            review_paragraph_index=index,
            sort_order=sort_order,
        )

    quizzes = [
        StudyProjectQuiz(
            title="Vechi",
            sort_order=0,
            questions=[
                question("Autonomia morala", 7, 0),
                question("autonomia  MORALA", 9, 1),  # same concept again
                question("Cercetarea duala", 126, 2),
                question(None, None, 3, prompt="Ce este plagiatul?"),
            ],
        )
    ]

    assert _previous_quiz_concepts(quizzes).splitlines() == [
        "- Autonomia morala",
        "- Cercetarea duala",
        "- Ce este plagiatul?",
    ]
    # A batch only hears about its own zone, plus questions with no reference.
    assert _previous_quiz_concepts(quizzes, zone={120, 126}).splitlines() == [
        "- Cercetarea duala",
        "- Ce este plagiatul?",
    ]

    prompt = build_reviss_single_quiz_prompt(
        "Etica",
        "Etica",
        "Facultate",
        SUMMARY,
        "",
        SUMMARY,
        "medium",
        1,
        ["single_choice"],
        "ro",
        previous_quiz_concepts=_previous_quiz_concepts(quizzes),
    )
    assert "CONCEPTE DEJA TESTATE IN QUIZURILE ANTERIOARE" in prompt
    assert "- Cercetarea duala" in prompt
    empty = build_reviss_single_quiz_prompt(
        "Etica", "Etica", "Facultate", SUMMARY, "", SUMMARY, "medium", 1,
        ["single_choice"], "ro",
    )
    assert "CONCEPTE DEJA TESTATE" not in empty


def test_quiz_batches_run_in_parallel_and_join_in_order(quiz_generation_context):
    import asyncio

    context = quiz_generation_context
    blocks = body_blocks(LONG_SUMMARY)
    in_flight = 0
    peak_in_flight = 0
    batches: list = []

    async def responder(**kwargs):
        nonlocal in_flight, peak_in_flight
        in_flight += 1
        peak_in_flight = max(peak_in_flight, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        number = int(kwargs["prompt"].split()[1])
        zone = [b for b in blocks if b["index"] in batches[number - 1].zone_indices]
        return SimpleNamespace(
            payload={
                "schema_version": "reviss.quiz.v2",
                "quiz": {
                    "title": f"Quiz {number}",
                    "description": "Descriere.",
                    "complexity": "medium",
                    "questions": [
                        choice_question(zone[index], f"{number}.{index}")
                        for index in range(4)
                    ],
                },
            },
            input_tokens=100,
            output_tokens=200,
        )

    batches.extend(batched_quiz_context(context, responder))
    run_batched_quiz(context, 8)

    assert peak_in_flight == 2
    calls = context.generator.generate_json.await_args_list
    assert sorted(call.kwargs["job_type"] for call in calls) == [
        "quiz_batch_1",
        "quiz_batch_2",
    ]
    assert all(call.kwargs["reasoning_effort"] == "low" for call in calls)
    quiz = context.project.quizzes[0]
    assert quiz.title == "Quiz 1"
    assert [question.prompt for question in quiz.questions] == [
        f"Ce descrie blocul {number}.{index}?"
        for number in (1, 2)
        for index in range(4)
    ]
    job = context.service._get_latest_generation_job.return_value
    assert (job.input_tokens, job.output_tokens) == (200, 400)
    context.credits.charge.assert_awaited_once()
    context.session.commit.assert_awaited_once()


def test_batch_repeating_another_batch_is_regenerated_alone(
    quiz_generation_context,
):
    context = quiz_generation_context
    blocks = body_blocks(LONG_SUMMARY)
    batches: list = []

    async def responder(**kwargs):
        number = int(kwargs["prompt"].split()[1])
        zone = [b for b in blocks if b["index"] in batches[number - 1].zone_indices]
        names = [f"{number}.{index}" for index in range(4)]
        if number == 2 and "REGENERARE" not in kwargs["prompt"]:
            names[0] = "1.0"  # the same question batch 1 asks
        return SimpleNamespace(
            payload={
                "schema_version": "reviss.quiz.v2",
                "quiz": {
                    "title": f"Quiz {number}",
                    "description": "Descriere.",
                    "complexity": "medium",
                    "questions": [
                        choice_question(block, name)
                        for block, name in zip(zone, names, strict=False)
                    ],
                },
            },
            input_tokens=100,
            output_tokens=200,
        )

    batches.extend(batched_quiz_context(context, responder))
    run_batched_quiz(context, 8)

    calls = context.generator.generate_json.await_args_list
    assert len(calls) == 3
    retry = calls[2].kwargs
    assert retry["job_type"] == "quiz_batch_2_retry"
    assert "repeta o intrebare din alt lot" in retry["prompt"]
    prompts = [question.prompt for question in context.project.quizzes[0].questions]
    assert len(set(prompts)) == 8


def test_generation_repairs_unique_quote_location_without_an_extra_request(
    quiz_generation_context,
):
    context = quiz_generation_context
    payload = quiz_payload()
    payload["quiz"]["questions"][0].update(
        review_paragraph_index=999,
        review_section="Wrong heading",
    )
    context.generator.generate_json.return_value = SimpleNamespace(
        payload=payload,
        input_tokens=100,
        output_tokens=200,
    )
    run_quiz_generation(context)
    context.generator.generate_json.assert_awaited_once()
    assert context.project.quizzes[0].questions[0].review_paragraph_index == 1
    assert context.project.quizzes[0].questions[0].review_section == "Etica"


def test_generation_does_not_retry_general_api_errors(quiz_generation_context):
    from app.services.openai_generation import OpenAIGenerationError

    context = quiz_generation_context
    context.generator.generate_json.side_effect = OpenAIGenerationError(
        "API unavailable"
    )
    with pytest.raises(OpenAIGenerationError):
        run_quiz_generation(context)
    context.generator.generate_json.assert_awaited_once()
    context.service._apply_generated_quiz.assert_not_called()
    context.credits.charge.assert_not_awaited()


def test_generation_cancellation_after_response_prevents_retry_and_save(
    quiz_generation_context,
):
    from app.services.projects import ProjectGenerationCancelledError

    context = quiz_generation_context
    context.generator.generate_json.return_value = SimpleNamespace(
        payload=quiz_payload(),
        input_tokens=100,
        output_tokens=200,
    )
    context.service._ensure_generation_can_continue.side_effect = [
        None,
        None,
        ProjectGenerationCancelledError("Cancelled"),
    ]
    with pytest.raises(ProjectGenerationCancelledError):
        run_quiz_generation(context)
    context.generator.generate_json.assert_awaited_once()
    context.service._apply_generated_quiz.assert_not_called()
    context.session.rollback.assert_awaited_once()
    context.service._fail_generation_job.assert_not_awaited()


@pytest.mark.parametrize(
    ("term", "text", "anchor"),
    [
        (
            "hipoalbuminemie",
            "Hipoalbuminemia este analizată în acest capitol.",
            "Hipoalbuminemia este analizată",
        ),
        (
            "normă morală",
            "Normele morale ghidează conduita în societate.",
            "Normele morale ghidează conduita",
        ),
        (
            "autonomie morală",
            "Conceptul descrie capacitatea de a decide după valori interiorizate.",
            "capacitatea de a decide după valori interiorizate",
        ),
    ],
)
def test_keyword_anchor_can_use_an_inflection_or_the_concept_definition(
    term, text, anchor
):
    payload = {
        "summary": {"content": "## Concepte\n\n" + text},
        "keywords": [{"term": term, "anchor_text": anchor}],
    }
    _validate_study_pack_anchors(payload)
    assert _keyword_paragraph_index(payload["summary"]["content"], anchor) == 1


@pytest.mark.parametrize(
    ("summary", "anchor"),
    [
        ("## Concepte\n\nUn paragraf real.", "Un fragment inexistent"),
        ("## Hipoalbuminemia\n\nUn paragraf real.", "Hipoalbuminemia"),
        (
            "## Concepte\n\nHipoalbuminemia este discutată aici.\n\n"
            "Hipoalbuminemia este discutată și aici.",
            "Hipoalbuminemia este discutată",
        ),
    ],
)
def test_inflected_keyword_still_requires_a_unique_real_body_quote(summary, anchor):
    with pytest.raises(ProjectValidationError, match="paragraf de continut"):
        _validate_study_pack_anchors(
            {
                "summary": {"content": summary},
                "keywords": [{"term": "hipoalbuminemie", "anchor_text": anchor}],
            }
        )


def part_payload(chapter, anchor=None):
    text = f"Hipoalbuminemia {chapter} este analizată în acest capitol."
    return {
        "schema_version": "reviss.study_pack_section.v1",
        "summary_content": f"## Capitolul {chapter}\n\n{text}",
        "keywords": [
            {
                "term": f"hipoalbuminemie {chapter}",
                "explanation": "Noțiunea analizată în capitol.",
                "anchor_text": anchor or f"Hipoalbuminemia {chapter} este analizată",
            }
        ],
        "flashcards": [
            {
                "front": f"Ce noțiune este analizată în capitolul {chapter}?",
                "back": "Hipoalbuminemia.",
                "category": f"Capitolul {chapter}",
                "difficulty": "low",
            }
        ],
    }


STRATEGIES_PAYLOAD = {
    "schema_version": "reviss.study_strategies.v1",
    "strategies": [
        {
            "title": "Verifică noțiunea",
            "description": "Explică din memorie noțiunea din capitolul 1.",
        }
    ],
}


def study_pack_context(monkeypatch, material, responder):
    import asyncio
    from pathlib import Path
    from unittest.mock import AsyncMock, Mock

    import app.services.projects as service_module

    project = StudyProject(
        id=uuid.uuid4(),
        name="Concepte",
        subject_name="Curs",
        institution_name="Facultate",
        generation_language="ro",
        keywords=[],
        flashcards=[],
        strategies=[],
    )
    user = SimpleNamespace(
        id=uuid.uuid4(), current_plan=plan(initial_flashcard_limit=4)
    )
    session = SimpleNamespace(commit=AsyncMock(), rollback=AsyncMock(), add=Mock())
    service = StudyProjectService(
        session=session, settings=SimpleNamespace(openai_study_model="test-model")
    )
    service.get_project = AsyncMock(return_value=project)
    service._get_latest_generation_job = AsyncMock(
        return_value=SimpleNamespace(id=uuid.uuid4())
    )
    service._mark_generation_job_running = AsyncMock()
    service._ensure_generation_can_continue = AsyncMock()
    service._read_project_markdown = Mock(return_value=material)
    service._write_generation_prompt = Mock(return_value=Path("prompt.txt"))
    service._write_generation_response = Mock(return_value=Path("response.json"))
    service._clear_generated_study_pack_content = AsyncMock()
    service._notify_project_ready = AsyncMock()
    service._fail_generation_job = AsyncMock()
    credits = SimpleNamespace(
        determine_tier=AsyncMock(return_value="small"),
        ensure_can_consume=AsyncMock(return_value=1),
        charge=AsyncMock(),
    )
    monkeypatch.setattr(service_module, "AiCreditsService", lambda _: credits)
    monkeypatch.setattr(service_module, "_current_billing_window", AsyncMock())
    generator = SimpleNamespace(generate_json=AsyncMock(side_effect=responder))
    monkeypatch.setattr(service_module, "OpenAIStudyGenerator", lambda _: generator)

    def run():
        return asyncio.run(
            service.generate_study_pack(user=user, project_id=project.id)
        )

    return SimpleNamespace(
        project=project,
        session=session,
        service=service,
        credits=credits,
        generator=generator,
        job=service._get_latest_generation_job.return_value,
        run=run,
    )


def result(payload, input_tokens=100, output_tokens=200):
    return SimpleNamespace(
        payload=payload,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
    )


def part_number_of(prompt):
    import re

    return int(re.search(r"partea (\d+) din", prompt).group(1))


@pytest.mark.parametrize("needs_retry", [False, True])
def test_study_pack_parts_run_in_parallel_and_join_in_order(monkeypatch, needs_retry):
    import asyncio

    material = course(chapters=3, paragraph_chars=1_300, paragraphs=6)
    in_flight = 0
    peak_in_flight = 0
    attempts: dict[str, int] = {}

    async def responder(**kwargs):
        nonlocal in_flight, peak_in_flight
        in_flight += 1
        peak_in_flight = max(peak_in_flight, in_flight)
        strategies = kwargs["schema_name"] == "reviss_study_strategies"
        await asyncio.sleep(0.005 if strategies else 0.02)
        in_flight -= 1
        attempts[kwargs["job_type"]] = attempts.get(kwargs["job_type"], 0) + 1
        if kwargs["schema_name"] == "reviss_study_strategies":
            return result(STRATEGIES_PAYLOAD, 10, 20)
        number = part_number_of(kwargs["prompt"])
        if needs_retry and number == 2 and kwargs["job_type"].endswith("_2"):
            # Only the rejected part is asked again.
            return result(part_payload(2, anchor="Fragment absent."), 40, 60)
        return result(part_payload(number))

    context = study_pack_context(monkeypatch, material, responder)
    context.run()

    part_count = len(_split_study_material(material))
    assert part_count == 3
    # Every part and the strategies were in flight at the same time.
    assert peak_in_flight == part_count + 1
    assert context.generator.generate_json.await_count == part_count + 1 + needs_retry
    if needs_retry:
        assert attempts["study_pack_part_2_retry"] == 1
        assert attempts["study_pack_part_1"] == 1

    project = context.project
    context.session.commit.assert_awaited_once()
    context.service._fail_generation_job.assert_not_awaited()
    assert project.status == "ready"
    headings = [
        block for block in project.summary.content.split("\n\n") if "##" in block
    ]
    assert headings == ["## Capitolul 1", "## Capitolul 2", "## Capitolul 3"]
    assert [keyword.term for keyword in project.keywords] == [
        "hipoalbuminemie 1",
        "hipoalbuminemie 2",
        "hipoalbuminemie 3",
    ]
    assert project.keywords[1].paragraph_index == 3
    assert len(project.flashcards) == 3
    assert len(project.strategies) == 1
    assert project.strategies_requested_at is None

    expected_input = 100 * part_count + 10 + (40 if needs_retry else 0)
    expected_output = 200 * part_count + 20 + (60 if needs_retry else 0)
    assert (context.job.input_tokens, context.job.output_tokens) == (
        expected_input,
        expected_output,
    )
    context.credits.charge.assert_awaited_once()
    assert context.credits.charge.await_args.kwargs["input_tokens"] == expected_input


def test_study_pack_part_that_fails_twice_cancels_the_others(monkeypatch):
    import asyncio

    from app.services.openai_generation import OpenAIGenerationError

    material = course(chapters=3, paragraph_chars=1_300, paragraphs=6)
    cancelled: list[int] = []

    async def responder(**kwargs):
        if kwargs["schema_name"] == "reviss_study_strategies":
            number = 0
        else:
            number = part_number_of(kwargs["prompt"])
        if number == 1:
            raise OpenAIGenerationError("Serviciul AI nu a putut genera.")
        try:
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            cancelled.append(number)
            raise
        return result(part_payload(number))

    context = study_pack_context(monkeypatch, material, responder)
    with pytest.raises(OpenAIGenerationError):
        context.run()

    assert sorted(cancelled) == [0, 2, 3]
    context.service._fail_generation_job.assert_awaited_once()
    context.session.commit.assert_not_awaited()
    context.credits.charge.assert_not_awaited()


def slow_strategies_responder(strategies_outcome):
    import asyncio

    async def responder(**kwargs):
        if kwargs["schema_name"] == "reviss_study_strategies":
            await asyncio.sleep(0.05)
            if isinstance(strategies_outcome, Exception):
                raise strategies_outcome
            return result(strategies_outcome, 10, 20)
        await asyncio.sleep(0.005)
        return result(part_payload(part_number_of(kwargs["prompt"])))

    return responder


def test_pack_is_ready_before_slow_strategies_and_they_are_added_after(
    monkeypatch,
):
    material = course(chapters=3, paragraph_chars=1_300, paragraphs=6)
    context = study_pack_context(
        monkeypatch, material, slow_strategies_responder(STRATEGIES_PAYLOAD)
    )
    project = context.project
    states = []

    async def commit():
        states.append(
            (
                project.status,
                len(project.strategies),
                _strategies_pending(project),
            )
        )

    context.session.commit.side_effect = commit
    context.run()

    # First the pack, marked as waiting for strategies; then the strategies.
    assert states == [("ready", 0, True), ("ready", 1, False)]
    assert project.strategies_requested_at is None
    assert project.strategies[0].title == "Verifică noțiunea"

    charges = [call.kwargs for call in context.credits.charge.await_args_list]
    assert [(charge["credits"], charge["input_tokens"]) for charge in charges] == [
        (1, 300),
        (0, 10),
    ]
    assert (context.job.input_tokens, context.job.output_tokens) == (310, 620)


def test_failed_strategies_do_not_fail_the_pack(monkeypatch):
    from app.services.openai_generation import OpenAIGenerationError

    material = course(chapters=3, paragraph_chars=1_300, paragraphs=6)
    context = study_pack_context(
        monkeypatch,
        material,
        slow_strategies_responder(OpenAIGenerationError("Indisponibil.")),
    )
    context.run()

    project = context.project
    assert project.status == "ready"
    assert project.strategies == []
    assert project.strategies_requested_at is None
    assert context.session.commit.await_count == 2
    context.service._fail_generation_job.assert_not_awaited()
    assert [
        call.kwargs["credits"] for call in context.credits.charge.await_args_list
    ] == [1]


def test_pending_strategies_expire_and_end_once_saved():
    from datetime import UTC, datetime, timedelta

    from app.models import StudyProjectStrategy

    now = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)
    project = StudyProject(strategies=[], strategies_requested_at=None)
    assert not _strategies_pending(project, now)

    project.strategies_requested_at = now - timedelta(minutes=1)
    assert _strategies_pending(project, now)
    assert not _strategies_pending(project, now + timedelta(minutes=10))

    project.strategies.append(StudyProjectStrategy(title="t", description="d"))
    assert not _strategies_pending(project, now)


def test_cancelling_a_quiz_leaves_the_study_pack_task_running():
    import asyncio

    import app.services.projects as service_module

    async def scenario():
        project_id = uuid.uuid4()
        pack = asyncio.ensure_future(asyncio.sleep(5))
        quiz = asyncio.ensure_future(asyncio.sleep(5))
        service_module._generation_tasks[(project_id, "study_pack")] = pack
        service_module._generation_tasks[(project_id, "quiz_pack")] = quiz
        try:
            assert service_module.cancel_generation_task(
                project_id, job_type="quiz_pack"
            )
            await asyncio.sleep(0)
            assert quiz.cancelled() and not pack.done()
            assert service_module.cancel_generation_task(project_id)
            await asyncio.sleep(0)
            assert pack.cancelled()
        finally:
            service_module._generation_tasks.pop((project_id, "study_pack"), None)
            service_module._generation_tasks.pop((project_id, "quiz_pack"), None)

    asyncio.run(scenario())


def test_run_all_or_cancel_returns_results_in_call_order():
    import asyncio

    async def value(delay, item):
        await asyncio.sleep(delay)
        return item

    assert asyncio.run(
        _run_all_or_cancel([value(0.02, "a"), value(0, "b"), value(0.01, "c")])
    ) == ["a", "b", "c"]


def test_keyword_anchor_allows_rendered_whitespace_and_case():
    summary = "## Concepte\n\n**Morala** se formează\nprin învățare socială."
    anchor = "morala  se formează\nprin învățare"
    assert _keyword_paragraph_index(summary, anchor) == 1
    _validate_study_pack_anchors(
        {
            "summary": {"content": summary},
            "keywords": [{"term": "morală", "anchor_text": anchor}],
        }
    )
    duplicate = summary + "\n\nMORALA se formează prin învățare și experiență."
    assert _keyword_paragraph_index(duplicate, anchor) is None


def test_unique_quote_repairs_only_metadata_and_preserves_content():
    payload = quiz_payload()
    question = payload["quiz"]["questions"][0]
    expected = copy.deepcopy(question)
    question.update(review_paragraph_index=2, review_section="Translated section")
    _repair_quiz_review_references(payload, SUMMARY)
    assert question == expected
    validate(payload)


@pytest.mark.parametrize(
    "anchor",
    [
        "Un citat inventat care nu există.",
        "Morala se formează prin învățare socială.",
    ],
)
def test_invented_or_ambiguous_quotes_never_guess_a_paragraph(anchor):
    summary = SUMMARY + "\n\nMorala se formează prin învățare socială."
    payload = quiz_payload()
    question = payload["quiz"]["questions"][0]
    question.update(review_paragraph_index=999, review_anchor_text=anchor)
    before = copy.deepcopy(payload)
    _repair_quiz_review_references(payload, summary)
    assert payload == before
    with pytest.raises(ProjectValidationError):
        _validate_generated_single_quiz(payload, summary=summary)


def test_request_schema_enforces_configuration_without_mutating_shared_schema():
    from app.services.openai_generation import SINGLE_QUIZ_SCHEMA

    before = copy.deepcopy(SINGLE_QUIZ_SCHEMA)
    schema = _single_quiz_schema("exam", 12, ["ordering", "matching"])
    quiz = schema["properties"]["quiz"]["properties"]
    assert quiz["complexity"]["enum"] == ["exam"]
    assert quiz["questions"]["minItems"] == quiz["questions"]["maxItems"] == 12
    assert quiz["questions"]["items"]["properties"]["type"]["enum"] == [
        "ordering",
        "matching",
    ]
    assert SINGLE_QUIZ_SCHEMA == before
    other = _single_quiz_schema("easy", 4, ["single_choice"])
    assert other["properties"]["quiz"]["properties"]["complexity"]["enum"] == ["easy"]
    assert quiz["complexity"]["enum"] == ["exam"]


def test_quiz_prompt_uses_requested_types_without_invalid_example():
    prompt = build_reviss_single_quiz_prompt(
        "Etica",
        "Etica",
        "Facultate",
        SUMMARY,
        "",
        SUMMARY,
        "medium",
        4,
        ["matching", "ordering"],
        "en",
    )
    assert '"type": "single_choice"' not in prompt
    assert '"review_paragraph_index": 0' not in prompt
    assert "1: matching" in prompt and "4: ordering" in prompt
    assert (
        "review_section si review_anchor_text, copiate exact in limba rezumatului"
        in prompt
    )


def _keyword(term, anchor):
    return {"term": term, "explanation": "x", "anchor_text": anchor}


def test_part_drops_unresolvable_keywords_and_is_rejected_only_without_any():
    part = {
        "summary_content": SUMMARY,
        "keywords": [
            _keyword("morala", "Morala se formează"),
            _keyword("inventat", "Fragment absent din rezumat."),
            _keyword("Morala", "Morala se formează"),  # duplicate term
        ],
        "flashcards": [],
    }
    kept = _validate_study_pack_part(part, part_number=2)
    assert [item["term"] for item in kept["keywords"]] == ["morala"]

    part["keywords"] = [_keyword("inventat", "Fragment absent din rezumat.")]
    with pytest.raises(ProjectValidationError, match="Partea 2"):
        _validate_study_pack_part(part, part_number=2)

    with pytest.raises(ProjectValidationError, match="paragrafe de rezumat"):
        _validate_study_pack_part(
            {"summary_content": "## Doar titlu", "keywords": [], "flashcards": []},
            part_number=1,
        )


def test_joining_parts_drops_repeated_terms_quotes_and_flashcards():
    card = {
        "front": "Ce este morala?",
        "back": "x",
        "category": "c",
        "difficulty": "low",
    }
    first = {
        "summary_content": "## Etica\n\nMorala se formează prin învățare socială.",
        "keywords": [_keyword("morala", "prin învățare socială")],
        "flashcards": [card],
    }
    second = {
        "summary_content": (
            "## Etica aplicată\n\nMorala se formează și prin exemplu.\n\n"
            "Normele juridice sunt stabilite prin lege."
        ),
        "keywords": [
            # Already defined by the first part.
            _keyword("Morala", "și prin exemplu"),
            # Unique inside its own part, ambiguous once the parts are joined.
            _keyword("formarea moralei", "Morala se formează"),
            _keyword("norma juridica", "Normele juridice sunt stabilite"),
        ],
        "flashcards": [dict(card, front="  ce este MORALA? ")],
    }

    payload, dropped = _merge_study_pack_parts([first, second], STRATEGIES_PAYLOAD)

    assert dropped == ["Morala", "formarea moralei"]
    assert [item["term"] for item in payload["keywords"]] == [
        "morala",
        "norma juridica",
    ]
    assert len(payload["flashcards"]) == 1
    assert payload["summary"]["content"].startswith("## Etica\n\nMorala")
    assert payload["strategies"] == STRATEGIES_PAYLOAD["strategies"]
    _validate_study_pack_anchors(payload)


def test_reading_minutes_come_from_word_count():
    assert _estimated_reading_minutes("") == 1
    assert _estimated_reading_minutes("cuvant " * 199) == 1
    assert _estimated_reading_minutes("cuvant " * 3772) == 19

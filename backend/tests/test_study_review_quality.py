"""Regression coverage for quiz quality and exact summary remediation."""

import copy
import json
import uuid
from types import SimpleNamespace

import pytest

from app.models import StudyProject
from app.schemas.projects import StudyProjectQuizQuestionResponse
from app.services.projects import (
    ProjectValidationError,
    StudyProjectService,
    _keyword_paragraph_index,
    _quiz_summary_context,
    _split_summary_blocks,
    _summary_reference_blocks,
    _validate_generated_single_quiz,
    _validate_quiz_answer_lengths,
    _validate_study_pack_anchors,
    build_reviss_study_pack_prompt,
    limits_for_user,
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
    prompt = build_reviss_study_pack_prompt("P", "S", "I", "Material", 5, "ro")
    assert "exact 5 flashcarduri" in prompt


@pytest.mark.parametrize("retry_succeeds", [True, False])
def test_generation_retries_bad_references_before_any_quiz_is_saved(
    monkeypatch, retry_succeeds
):
    import asyncio
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
    bad = quiz_payload()
    bad["quiz"]["questions"][0]["review_paragraph_index"] = 999
    good = quiz_payload()
    generator = SimpleNamespace(
        generate_json=AsyncMock(
            side_effect=[
                SimpleNamespace(payload=bad, input_tokens=100, output_tokens=200),
                SimpleNamespace(
                    payload=good if retry_succeeds else bad,
                    input_tokens=150,
                    output_tokens=250,
                    total_tokens=400,
                ),
            ]
        )
    )
    monkeypatch.setattr(service_module, "OpenAIStudyGenerator", lambda _: generator)
    run = service.generate_single_quiz(
        user=user,
        project_id=project.id,
        complexity="medium",
        question_count=1,
        question_types=["single_choice"],
    )
    if retry_succeeds:
        asyncio.run(run)
        service._apply_generated_quiz.assert_called_once_with(project, good)
        assert len(project.quizzes) == 1
        assert project.quizzes[0].questions[0].review_paragraph_index == 1
        assert credits.charge.call_args.kwargs["input_tokens"] == 250
        assert credits.charge.call_args.kwargs["output_tokens"] == 450
        job = service._get_latest_generation_job.return_value
        assert job.input_tokens == 250
        assert job.output_tokens == 450
        assert job.total_tokens == 700
        session.commit.assert_awaited_once()
    else:
        with pytest.raises(ProjectValidationError):
            asyncio.run(run)
        service._apply_generated_quiz.assert_not_called()
        service._write_generation_response.assert_not_called()
        session.commit.assert_not_awaited()
        credits.charge.assert_not_awaited()
        service._fail_generation_job.assert_awaited_once()
    assert generator.generate_json.await_count == 2
    retry_prompt = generator.generate_json.call_args_list[1].kwargs["prompt"]
    assert "REGENERARE OBLIGATORIE" in retry_prompt
    assert "Referinta de revizuire este invalida" in retry_prompt


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


@pytest.mark.parametrize("needs_retry", [False, True])
def test_study_pack_saves_inflected_keyword_and_accounts_for_retries(
    monkeypatch, needs_retry
):
    import asyncio
    from pathlib import Path
    from unittest.mock import AsyncMock, Mock

    import app.services.projects as service_module

    summary = "## Concepte\n\nHipoalbuminemia este analizată în acest capitol."
    payload = {
        "schema_version": "reviss.study_pack.v1",
        "summary": {"content": summary, "estimated_reading_minutes": 1},
        "keywords": [
            {
                "term": "hipoalbuminemie",
                "explanation": "Noțiunea analizată în capitol.",
                "anchor_text": "Hipoalbuminemia este analizată",
            }
        ],
        "flashcards": [
            {
                "front": "Ce noțiune este analizată?",
                "back": "Hipoalbuminemia.",
                "category": "Concepte",
                "difficulty": "low",
            }
        ],
        "strategies": [
            {
                "title": "Verifică noțiunea",
                "description": "Explică din memorie noțiunea din secțiunea Concepte.",
            }
        ],
    }
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
    user = SimpleNamespace(id=uuid.uuid4(), current_plan=plan())
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
    service._read_project_markdown = Mock(return_value=summary)
    service._build_study_pack_prompt = Mock(return_value="Study pack prompt")
    service._write_generation_prompt = Mock(return_value=Path("prompt.txt"))
    service._write_generation_response = Mock(return_value=Path("response.json"))
    service._clear_generated_study_pack_content = AsyncMock()
    service._mark_generation_job_completed = Mock(
        wraps=service._mark_generation_job_completed
    )
    service._notify_project_ready = AsyncMock()
    service._fail_generation_job = AsyncMock()
    credits = SimpleNamespace(
        determine_tier=AsyncMock(return_value="small"),
        ensure_can_consume=AsyncMock(return_value=1),
        charge=AsyncMock(),
    )
    monkeypatch.setattr(service_module, "AiCreditsService", lambda _: credits)
    monkeypatch.setattr(service_module, "_current_billing_window", AsyncMock())
    results = [
        SimpleNamespace(
            payload=payload,
            input_tokens=100,
            output_tokens=200,
            total_tokens=300,
        )
    ]
    if needs_retry:
        invalid_payload = copy.deepcopy(payload)
        invalid_payload["keywords"][0]["anchor_text"] = "Fragment absent din rezumat."
        results.insert(
            0,
            SimpleNamespace(
                payload=invalid_payload,
                input_tokens=40,
                output_tokens=60,
                total_tokens=100,
            ),
        )
    generator = SimpleNamespace(generate_json=AsyncMock(side_effect=results))
    monkeypatch.setattr(service_module, "OpenAIStudyGenerator", lambda _: generator)

    asyncio.run(service.generate_study_pack(user=user, project_id=project.id))

    assert generator.generate_json.await_count == (2 if needs_retry else 1)
    session.commit.assert_awaited_once()
    service._fail_generation_job.assert_not_awaited()
    assert project.status == "ready"
    assert project.summary.content == summary
    assert len(project.flashcards) == 1
    assert len(project.strategies) == 1
    assert len(project.keywords) == 1
    assert project.keywords[0].term == "hipoalbuminemie"
    assert project.keywords[0].anchor_text == "Hipoalbuminemia este analizată"
    assert project.keywords[0].paragraph_index == 1
    credits.charge.assert_awaited_once()
    job = service._get_latest_generation_job.return_value
    assert job.input_tokens == (140 if needs_retry else 100)
    assert job.output_tokens == (260 if needs_retry else 200)
    assert job.total_tokens == (400 if needs_retry else 300)
    assert credits.charge.await_args.kwargs["input_tokens"] == job.input_tokens
    assert credits.charge.await_args.kwargs["output_tokens"] == job.output_tokens


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

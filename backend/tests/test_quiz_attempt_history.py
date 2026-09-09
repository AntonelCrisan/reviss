"""Persist quiz review history without changing legacy completion behavior."""

import asyncio
import runpy
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models.study_project import (
    StudyProjectQuiz,
    StudyProjectQuizAttempt,
    StudyProjectQuizQuestion,
)
from app.schemas.projects import (
    StudyProjectQuizAttemptResponse,
    StudyProjectQuizCompletionCreate,
)
from app.services.projects import (
    ProjectNotFoundError,
    ProjectValidationError,
    StudyProjectService,
)


@pytest.fixture
def history_service(monkeypatch):
    engine = sa.create_engine("sqlite://")
    for model in (StudyProjectQuiz, StudyProjectQuizQuestion, StudyProjectQuizAttempt):
        model.__table__.create(engine)
    with Session(engine, expire_on_commit=False) as db:
        quiz = StudyProjectQuiz(
            id=uuid.uuid4(),
            project_id=uuid.uuid4(),
            title="Quiz",
            questions=[
                StudyProjectQuizQuestion(
                    id=uuid.uuid4(),
                    prompt="Question",
                    question_type="single_choice",
                    sort_order=index,
                )
                for index in range(2)
            ],
            attempts=[],
        )
        db.add(quiz)
        db.commit()
        project = SimpleNamespace(id=quiz.project_id, quizzes=[quiz])
        session = SimpleNamespace(
            execute=AsyncMock(side_effect=db.execute),
            get=AsyncMock(side_effect=db.get),
            refresh=AsyncMock(side_effect=db.refresh),
            commit=AsyncMock(side_effect=db.commit),
        )
        service = StudyProjectService(session, SimpleNamespace())
        service.get_project = AsyncMock(return_value=project)
        activity = AsyncMock()
        monkeypatch.setattr("app.services.projects.record_study_activity", activity)
        user = SimpleNamespace(id=uuid.uuid4())
        results = [
            {"question_id": str(question.id), "is_correct": index == 0}
            for index, question in enumerate(quiz.questions)
        ]

        def complete(**changes):
            args = dict(
                user=user,
                project_id=project.id,
                quiz_id=quiz.id,
                correct_count=1,
                answered_count=2,
                question_results=results,
                attempt_id=uuid.uuid4(),
            )
            args.update(changes)
            return asyncio.run(service.complete_quiz(**args))

        yield SimpleNamespace(
            service=service,
            session=session,
            db=db,
            quiz=quiz,
            results=results,
            complete=complete,
            activity=activity,
        )
    engine.dispose()


def test_details_survive_database_reload_and_api_serialization(history_service):
    ctx = history_service
    attempt_id = uuid.uuid4()
    ctx.complete(attempt_id=attempt_id)
    ctx.db.expire_all()
    attempt = ctx.db.get(StudyProjectQuizAttempt, attempt_id)
    response = StudyProjectQuizAttemptResponse.model_validate(attempt)
    assert response.correct_count == 1
    assert response.answered_count == 2
    assert response.score_percent == 50
    assert response.model_dump(mode="json")["question_results"] == sorted(
        ctx.results, key=lambda item: item["question_id"]
    )
    ctx.activity.assert_awaited_once()


def test_legacy_completion_and_attempts_remain_readable(history_service):
    ctx = history_service
    ctx.complete(question_results=None, attempt_id=None)
    attempt = ctx.quiz.attempts[0]
    assert attempt.question_results is None
    assert (
        StudyProjectQuizAttemptResponse.model_validate(attempt).question_results is None
    )
    assert (
        StudyProjectQuizCompletionCreate(
            correct_count=1, answered_count=2
        ).question_results
        is None
    )


def test_retries_do_not_duplicate_attempts_or_overwrite_newer_progress(history_service):
    ctx = history_service
    first_id = uuid.uuid4()
    ctx.complete(attempt_id=first_id)
    ctx.complete(attempt_id=first_id, question_results=list(reversed(ctx.results)))
    assert len(ctx.quiz.attempts) == 1
    correct = [dict(item, is_correct=True) for item in ctx.results]
    ctx.complete(correct_count=2, question_results=correct)
    # Compare persisted timestamps; SQLite drops timezone metadata on reload.
    ctx.db.refresh(ctx.quiz, attribute_names=["completed_at"])
    latest_time = ctx.quiz.completed_at
    ctx.complete(attempt_id=first_id)
    assert len(ctx.quiz.attempts) == 2
    assert ctx.quiz.score_percent == 100
    assert ctx.quiz.completed_at == latest_time
    assert ctx.activity.await_count == 2


def test_a_retry_cannot_change_a_saved_attempt(history_service):
    ctx = history_service
    attempt_id = uuid.uuid4()
    ctx.complete(attempt_id=attempt_id)
    with pytest.raises(ProjectValidationError, match="alte rezultate"):
        ctx.complete(
            attempt_id=attempt_id,
            correct_count=2,
            question_results=[dict(item, is_correct=True) for item in ctx.results],
        )
    assert len(ctx.quiz.attempts) == 1
    assert ctx.quiz.score_percent == 50


@pytest.mark.parametrize(
    "problem", ["foreign", "duplicate", "count", "score", "boolean"]
)
def test_invalid_details_are_rejected_before_any_result_is_saved(
    history_service, problem
):
    ctx = history_service
    results = [dict(item) for item in ctx.results]
    if problem == "foreign":
        results[0]["question_id"] = str(uuid.uuid4())
    elif problem == "duplicate":
        results[1]["question_id"] = results[0]["question_id"]
    elif problem == "count":
        results.pop()
    elif problem == "score":
        results[1]["is_correct"] = True
    else:
        results[0]["is_correct"] = "true"
    with pytest.raises(ProjectValidationError):
        ctx.complete(question_results=results)
    assert ctx.quiz.completed_at is None
    assert not ctx.quiz.attempts
    ctx.session.commit.assert_not_awaited()
    ctx.activity.assert_not_awaited()


def test_completion_cannot_target_a_quiz_outside_the_project(history_service):
    ctx = history_service
    with pytest.raises(ProjectNotFoundError):
        ctx.complete(quiz_id=uuid.uuid4())
    ctx.session.commit.assert_not_awaited()


def test_result_schema_rejects_non_boolean_correctness():
    with pytest.raises(ValidationError):
        StudyProjectQuizCompletionCreate(
            correct_count=1,
            answered_count=1,
            question_results=[{"question_id": uuid.uuid4(), "is_correct": "false"}],
        )


def test_completion_route_forwards_typed_results(monkeypatch):
    from app.api.routes import projects as routes

    project = object()
    service = SimpleNamespace(
        complete_quiz=AsyncMock(return_value=project),
        to_response=Mock(return_value="response"),
    )
    monkeypatch.setattr(routes, "_service", lambda *_: service)
    monkeypatch.setattr(routes, "_enforce_project_rate_limit", AsyncMock())
    payload = StudyProjectQuizCompletionCreate(
        correct_count=0,
        answered_count=1,
        attempt_id=uuid.uuid4(),
        question_results=[{"question_id": uuid.uuid4(), "is_correct": False}],
    )
    asyncio.run(
        routes.complete_quiz(
            project_id=uuid.uuid4(),
            quiz_id=uuid.uuid4(),
            payload=payload,
            current_user=SimpleNamespace(id=uuid.uuid4()),
            session=SimpleNamespace(),
            settings=SimpleNamespace(),
        )
    )
    values = service.complete_quiz.await_args.kwargs
    assert values["attempt_id"] == payload.attempt_id
    assert values["question_results"] == [
        item.model_dump(mode="json") for item in payload.question_results
    ]


def test_history_migration_keeps_legacy_scores_and_nullable_details():
    migration = runpy.run_path(
        str(
            Path(__file__).resolve().parents[1]
            / "migrations/versions/20260907_0047_add_quiz_attempt_question_results.py"
        )
    )
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE study_project_quiz_attempts "
                "(id INTEGER PRIMARY KEY, score_percent INTEGER NOT NULL)"
            )
        )
        connection.execute(
            sa.text("INSERT INTO study_project_quiz_attempts VALUES (1, 75)")
        )
        operations = Operations(MigrationContext.configure(connection))
        for name in ("upgrade", "downgrade"):
            migration[name].__globals__["op"] = operations
        migration["upgrade"]()
        column = next(
            item
            for item in sa.inspect(connection).get_columns(
                "study_project_quiz_attempts"
            )
            if item["name"] == "question_results"
        )
        assert column["nullable"]
        assert connection.execute(
            sa.text(
                "SELECT score_percent, question_results "
                "FROM study_project_quiz_attempts"
            )
        ).one() == (75, None)
        migration["downgrade"]()
        assert connection.execute(
            sa.text("SELECT * FROM study_project_quiz_attempts")
        ).one() == (1, 75)
    engine.dispose()


def test_attempt_id_from_another_quiz_cannot_be_reused(history_service):
    ctx = history_service
    other_quiz = StudyProjectQuiz(
        id=uuid.uuid4(),
        project_id=ctx.quiz.project_id,
        title="Another quiz",
        attempts=[
            StudyProjectQuizAttempt(
                id=uuid.uuid4(),
                score_percent=0,
                correct_count=0,
                answered_count=1,
            )
        ],
    )
    ctx.db.add(other_quiz)
    ctx.db.commit()
    with pytest.raises(ProjectValidationError, match="Identificatorul"):
        ctx.complete(attempt_id=other_quiz.attempts[0].id)
    assert not ctx.quiz.attempts
    assert ctx.quiz.completed_at is None
    ctx.session.commit.assert_not_awaited()


def test_completion_refreshes_scores_changed_while_waiting_for_quiz_lock(
    history_service,
):
    ctx = history_service
    incorrect = [dict(item, is_correct=False) for item in ctx.results]
    ctx.complete(correct_count=0, question_results=incorrect)
    assert ctx.quiz.score_percent == 0

    def acquire_lock_after_another_completion(statement):
        result = ctx.db.execute(statement)
        # Model the database change between loading the project and taking its
        # quiz lock. The already-loaded Python object still contains the old 0.
        ctx.db.execute(
            sa.update(StudyProjectQuiz)
            .where(StudyProjectQuiz.id == ctx.quiz.id)
            .values(score_percent=100, correct_count=2)
            .execution_options(synchronize_session=False)
        )
        return result

    ctx.session.execute.side_effect = acquire_lock_after_another_completion
    ctx.complete(correct_count=0, question_results=incorrect)
    quiz_id = ctx.quiz.id
    ctx.db.expire_all()
    reloaded = ctx.db.get(StudyProjectQuiz, quiz_id)
    assert reloaded.score_percent == 0
    assert reloaded.correct_count == 0
    assert len(reloaded.attempts) == 2

"""A restart must not leave a project stuck in "se genereaza" forever."""

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import app.services.projects as service_module
from app.services.projects import fail_interrupted_generations


def run_recovery(monkeypatch, stale_project_ids, rowcount=2):
    statements = []

    async def execute(statement):
        compiled = statement.compile(compile_kwargs={"literal_binds": True})
        statements.append(str(compiled))
        return SimpleNamespace(rowcount=rowcount)

    async def scalars(_statement):
        return SimpleNamespace(all=lambda: stale_project_ids)

    session = SimpleNamespace(
        execute=execute, scalars=scalars, commit=AsyncMock()
    )

    class FakeSessionFactory:
        async def __aenter__(self):
            return session

        async def __aexit__(self, *exc_info):
            return False

    monkeypatch.setattr(service_module, "AsyncSessionFactory", FakeSessionFactory)
    failed = asyncio.run(fail_interrupted_generations())
    return failed, statements, session


def test_stale_jobs_and_their_projects_are_cleared(monkeypatch):
    project_id = uuid.uuid4()
    failed, statements, session = run_recovery(monkeypatch, [project_id])

    assert failed == 2
    session.commit.assert_awaited_once()
    jobs, quizzes, packs, strategies = statements
    assert "UPDATE study_project_generation_jobs" in jobs
    assert "'failed'" in jobs and "queued" in jobs and "running" in jobs
    # Only what has been running past the grace period.
    assert "coalesce" in jobs.lower()
    # A cut quiz leaves the project usable; a cut pack leaves it empty.
    assert "generating_quizzes" in quizzes and "'ready'" in quizzes
    assert "generating_study_pack" in packs and "'failed'" in packs
    # The id is rendered without its dashes by the literal binds.
    assert all(project_id.hex in statement for statement in (quizzes, packs))
    assert "strategies_requested_at" in strategies


def test_a_generation_still_within_the_grace_period_is_left_alone(monkeypatch):
    # A deploy starts the new instance while the old one still generates: no
    # job is stale yet, so no project is touched.
    failed, statements, session = run_recovery(monkeypatch, [], rowcount=0)

    assert failed == 0
    assert len(statements) == 2  # the jobs update and the strategies cleanup
    session.commit.assert_awaited_once()

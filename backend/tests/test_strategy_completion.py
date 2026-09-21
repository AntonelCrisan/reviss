"""The study route is walked in order: no step is skipped, no gap is left."""

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models import StudyProject, StudyProjectStrategy
from app.services.projects import (
    ProjectNotFoundError,
    ProjectValidationError,
    StudyProjectService,
)


def service_with(steps):
    project = StudyProject(id=uuid.uuid4(), strategies=steps)
    service = StudyProjectService(
        session=SimpleNamespace(commit=AsyncMock()), settings=SimpleNamespace()
    )
    service.get_project = AsyncMock(return_value=project)
    return service, project


def steps(completed_count=0, count=3):
    from datetime import UTC, datetime

    done_at = datetime(2026, 9, 21, tzinfo=UTC)
    return [
        StudyProjectStrategy(
            id=uuid.uuid4(),
            title=f"Pasul {index + 1}",
            description="x",
            sort_order=index,
            completed_at=done_at if index < completed_count else None,
        )
        for index in range(count)
    ]


def mark(service, project, strategy, completed):
    return asyncio.run(
        service.set_strategy_completed(
            user=SimpleNamespace(id=uuid.uuid4()),
            project_id=project.id,
            strategy_id=strategy.id,
            completed=completed,
        )
    )


def test_steps_are_completed_in_order():
    route = steps()
    service, project = service_with(route)

    mark(service, project, route[0], True)
    assert route[0].completed_at is not None

    mark(service, project, route[1], True)
    assert route[1].completed_at is not None
    assert service.session.commit.await_count == 2


def test_a_later_step_cannot_be_marked_before_the_ones_before_it():
    route = steps()
    service, project = service_with(route)

    with pytest.raises(ProjectValidationError, match="pasii anteriori"):
        mark(service, project, route[2], True)
    assert route[2].completed_at is None
    service.session.commit.assert_not_awaited()


def test_only_the_last_done_step_can_be_undone():
    route = steps(completed_count=3)
    service, project = service_with(route)

    with pytest.raises(ProjectValidationError, match="pasii urmatori"):
        mark(service, project, route[0], False)
    assert route[0].completed_at is not None

    mark(service, project, route[2], False)
    assert route[2].completed_at is None


def test_marking_a_done_step_again_keeps_its_time_and_unknown_steps_404():
    route = steps(completed_count=1)
    service, project = service_with(route)
    marked_at = route[0].completed_at

    mark(service, project, route[0], True)
    assert route[0].completed_at == marked_at

    with pytest.raises(ProjectNotFoundError):
        mark(service, project, SimpleNamespace(id=uuid.uuid4()), True)

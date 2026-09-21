"""Exercise Responses API terminal states before JSON reaches project storage."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.openai_generation import (
    OpenAIGenerationError,
    OpenAIOutputError,
    OpenAIStudyGenerator,
)


def generate(response):
    generator = OpenAIStudyGenerator.__new__(OpenAIStudyGenerator)
    generator._settings = SimpleNamespace(openai_request_timeout_seconds=60)
    generator._client = SimpleNamespace(
        responses=SimpleNamespace(create=AsyncMock(return_value=response)),
    )
    return asyncio.run(
        generator.generate_json(
            model="test-model",
            instructions="Return JSON",
            prompt="Course material",
            schema_name="test_schema",
            schema={"type": "object"},
            max_output_tokens=4000,
            reasoning_effort="medium",
            user_id="test-user",
            project_id="test-project",
            job_type="quiz_pack",
        )
    )


def response(**changes):
    fields = dict(
        id="response-id",
        status="completed",
        output_text='{"quiz": {}}',
        output=[],
        incomplete_details=None,
        usage=SimpleNamespace(input_tokens=17, output_tokens=29, total_tokens=46),
    )
    fields.update(changes)
    return SimpleNamespace(**fields)


def test_completed_response_returns_json_and_usage():
    result = generate(response())
    assert result.payload == {"quiz": {}}
    assert (result.input_tokens, result.output_tokens, result.total_tokens) == (
        17,
        29,
        46,
    )


@pytest.mark.parametrize("output_text", ['{"quiz":', '{"quiz": {}}', ""])
def test_token_limited_response_is_never_accepted_even_if_json_parses(output_text):
    with pytest.raises(OpenAIOutputError) as caught:
        generate(
            response(
                status="incomplete",
                output_text=output_text,
                incomplete_details=SimpleNamespace(reason="max_output_tokens"),
            )
        )
    assert caught.value.reason == "max_output_tokens"
    assert (caught.value.input_tokens, caught.value.output_tokens) == (17, 29)


@pytest.mark.parametrize("output_text", ["", "not json", "[]", "null"])
def test_invalid_completed_json_is_retryable_and_preserves_usage(output_text):
    with pytest.raises(OpenAIOutputError) as caught:
        generate(response(output_text=output_text))
    assert caught.value.reason == "invalid_json"
    assert caught.value.input_tokens == 17


@pytest.mark.parametrize(
    "state", ["refusal", "content_filter", "failed", "in_progress"]
)
def test_refusals_and_other_incomplete_states_are_not_blindly_retried(state):
    result = response()
    if state == "refusal":
        result.output = [SimpleNamespace(content=[SimpleNamespace(type="refusal")])]
    elif state == "content_filter":
        result.status = "incomplete"
        result.incomplete_details = SimpleNamespace(reason="content_filter")
    else:
        result.status = state
    with pytest.raises(OpenAIGenerationError) as caught:
        generate(result)
    assert not isinstance(caught.value, OpenAIOutputError)


def test_realistic_response_content_blocks_do_not_break_success():
    payload = {"quiz": {"title": "Etica"}}
    result = generate(
        response(
            output=[
                SimpleNamespace(type="reasoning"),
                SimpleNamespace(content=[SimpleNamespace(type="output_text")]),
            ],
            output_text=json.dumps(payload),
        )
    )
    assert result.payload == payload


def stream(events):
    from app.services.openai_generation import OpenAIStreamUsage

    async def event_stream():
        for event in events:
            yield event

    generator = OpenAIStudyGenerator.__new__(OpenAIStudyGenerator)
    generator._settings = SimpleNamespace(openai_request_timeout_seconds=60)
    generator._client = SimpleNamespace(
        responses=SimpleNamespace(
            create=AsyncMock(return_value=event_stream())
        ),
    )
    usage = OpenAIStreamUsage()

    async def collect():
        return [
            delta
            async for delta in generator.stream_text(
                model="test-model",
                instructions="Answer",
                prompt="Question",
                max_output_tokens=900,
                reasoning_effort="low",
                user_id="test-user",
                project_id="test-project",
                job_type="project_chat_stream",
                usage=usage,
            )
        ]

    return asyncio.run(collect()), usage, generator._client.responses.create


def delta(text):
    return SimpleNamespace(type="response.output_text.delta", delta=text)


def test_stream_yields_text_as_written_and_records_usage():
    completed = SimpleNamespace(
        type="response.completed",
        response=SimpleNamespace(
            status="completed",
            usage=SimpleNamespace(
                input_tokens=40,
                output_tokens=12,
                output_tokens_details=SimpleNamespace(reasoning_tokens=3),
            ),
        ),
    )
    deltas, usage, create = stream(
        [
            SimpleNamespace(type="response.created"),
            delta("Morala "),
            delta("se învață."),
            completed,
        ]
    )

    assert deltas == ["Morala ", "se învață."]
    assert usage.status == "completed"
    assert (usage.input_tokens, usage.output_tokens) == (40, 12)
    assert usage.reasoning_tokens == 3
    assert usage.first_token_seconds is not None
    kwargs = create.await_args.kwargs
    assert kwargs["stream"] is True
    # Plain text: no JSON schema is sent for a streamed answer.
    assert "text" not in kwargs


@pytest.mark.parametrize(
    "event",
    [
        SimpleNamespace(type="response.refusal.delta", delta="Nu pot."),
        SimpleNamespace(type="response.failed", response=None),
        SimpleNamespace(type="error", message="boom"),
    ],
)
def test_stream_failures_raise_after_the_text_already_sent(event):
    with pytest.raises(OpenAIGenerationError):
        stream([delta("Început "), event])


def peak_parallel_calls(limit, bulk):
    """How many calls the client lets through at once, given the slot limit."""
    import app.services.openai_generation as module

    module._bulk_slots = None
    state = {"in_flight": 0, "peak": 0}

    async def create(**_kwargs):
        state["in_flight"] += 1
        state["peak"] = max(state["peak"], state["in_flight"])
        await asyncio.sleep(0.02)
        state["in_flight"] -= 1
        return response()

    generator = OpenAIStudyGenerator.__new__(OpenAIStudyGenerator)
    generator._settings = SimpleNamespace(
        openai_request_timeout_seconds=60,
        openai_max_parallel_generations=limit,
    )
    generator._client = SimpleNamespace(responses=SimpleNamespace(create=create))

    async def call():
        return await generator.generate_json(
            model="test-model",
            instructions="Return JSON",
            prompt="Course material",
            schema_name="test_schema",
            schema={"type": "object"},
            max_output_tokens=4000,
            reasoning_effort="low",
            user_id="test-user",
            project_id="test-project",
            job_type="study_pack_part_1",
            bulk=bulk,
        )

    async def both():
        await asyncio.gather(call(), call())

    asyncio.run(both())
    module._bulk_slots = None
    return state["peak"]


def test_bulk_calls_queue_on_the_shared_slots_while_chat_never_waits():
    # Generation queues on the shared slots...
    assert peak_parallel_calls(limit=1, bulk=True) == 1
    # ...but a chat answer or an explanation never waits behind it.
    assert peak_parallel_calls(limit=1, bulk=False) == 2

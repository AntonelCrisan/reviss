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

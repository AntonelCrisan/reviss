from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any

from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AsyncOpenAI,
    RateLimitError,
)

from app.core.config import Settings


class OpenAIGenerationError(Exception):
    pass


class OpenAIOutputError(OpenAIGenerationError):
    """A retryable output failure, with usage retained for the whole job."""

    def __init__(
        self, message: str, *, reason: str, input_tokens: int, output_tokens: int
    ) -> None:
        super().__init__(message)
        self.reason = reason
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


def _prompt_cache_key(job_type: str, project_id: str) -> str:
    safe_job_type = re.sub(r"[^a-z0-9_-]+", "_", job_type.lower())[:32]
    digest = hashlib.sha256(f"{job_type}:{project_id}".encode()).hexdigest()
    return f"reviss:{safe_job_type}:{digest[:16]}"


@dataclass(slots=True)
class OpenAIGenerationResult:
    payload: dict[str, Any]
    response_id: str | None
    input_tokens: int
    output_tokens: int
    total_tokens: int


class OpenAIStudyGenerator:
    def __init__(self, settings: Settings) -> None:
        if settings.openai_api_key is None:
            raise OpenAIGenerationError("Serviciul de generare nu este configurat.")

        self._settings = settings
        self._client = AsyncOpenAI(
            api_key=settings.openai_api_key.get_secret_value(),
            timeout=settings.openai_request_timeout_seconds,
        )

    async def generate_json(
        self,
        *,
        model: str,
        instructions: str,
        prompt: str,
        schema_name: str,
        schema: dict[str, Any],
        max_output_tokens: int,
        reasoning_effort: str,
        user_id: str,
        project_id: str,
        job_type: str,
        timeout_seconds: int | None = None,
        prompt_cache_key: str | None = None,
        text_verbosity: str | None = None,
    ) -> OpenAIGenerationResult:
        text_config: dict[str, Any] = {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "strict": True,
                "schema": schema,
            }
        }
        if text_verbosity:
            text_config["verbosity"] = text_verbosity

        cache_key = prompt_cache_key or _prompt_cache_key(job_type, project_id)
        request_timeout = (
            timeout_seconds or self._settings.openai_request_timeout_seconds
        )

        try:
            response = await self._client.responses.create(
                model=model,
                instructions=instructions,
                input=prompt,
                max_output_tokens=max_output_tokens,
                reasoning={"effort": reasoning_effort},
                text=text_config,
                store=False,
                metadata={
                    "app": "reviss",
                    "project_id": project_id,
                    "job_type": job_type,
                },
                prompt_cache_key=cache_key[:64],
                safety_identifier=user_id[:64],
                timeout=request_timeout,
            )
        except (APIConnectionError, APITimeoutError) as exc:
            raise OpenAIGenerationError(
                "Serviciul de generare nu a raspuns la timp. Incearca din nou."
            ) from exc
        except RateLimitError as exc:
            error_code = getattr(exc, "code", None)
            if error_code == "insufficient_quota":
                raise OpenAIGenerationError(
                    "Generarea nu este disponibila momentan. Incearca din nou "
                    "in cateva minute."
                ) from exc
            raise OpenAIGenerationError(
                "Serviciul de generare este aglomerat momentan. Incearca din nou."
            ) from exc
        except APIError as exc:
            raise OpenAIGenerationError(
                "Pachetul nu a putut fi generat momentan. Incearca din nou."
            ) from exc

        usage = getattr(response, "usage", None)
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        total_tokens = int(getattr(usage, "total_tokens", 0) or 0)

        # A refusal or an incomplete response may still have output_text.
        # Never mistake that text for a complete, usable study artifact.
        for item in getattr(response, "output", None) or []:
            for content in getattr(item, "content", None) or []:
                if getattr(content, "type", None) == "refusal":
                    raise OpenAIGenerationError(
                        "Serviciul AI nu a putut genera continut pentru acest material."
                    )
        status = getattr(response, "status", None)
        if status == "incomplete":
            details = getattr(response, "incomplete_details", None)
            reason = getattr(details, "reason", None)
            if reason == "max_output_tokens":
                raise OpenAIOutputError(
                    "Raspunsul AI a fost intrerupt la limita de generare.",
                    reason=reason,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
            raise OpenAIGenerationError(
                "Serviciul AI nu a putut finaliza generarea pentru acest material."
            )
        if status not in (None, "completed"):
            raise OpenAIGenerationError(
                "Serviciul AI nu a finalizat generarea. Incearca din nou."
            )

        raw_output = getattr(response, "output_text", "") or ""
        try:
            payload = json.loads(raw_output)
        except json.JSONDecodeError as exc:
            raise OpenAIOutputError(
                "Pachetul generat nu a putut fi citit corect.",
                reason="invalid_json",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            ) from exc

        if not isinstance(payload, dict):
            raise OpenAIOutputError(
                "Pachetul generat are o structura invalida.",
                reason="invalid_json",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )

        return OpenAIGenerationResult(
            payload=payload,
            response_id=getattr(response, "id", None),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
        )


AI_EXPLANATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["title", "answer", "bullets"],
    "properties": {
        "title": {"type": "string", "minLength": 2, "maxLength": 120},
        "answer": {"type": "string", "minLength": 2, "maxLength": 1200},
        "bullets": {
            "type": "array",
            "minItems": 2,
            "maxItems": 4,
            "items": {"type": "string", "minLength": 2, "maxLength": 260},
        },
    },
}


AI_CHAT_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["answer"],
    "properties": {
        "answer": {"type": "string", "minLength": 20, "maxLength": 1800},
    },
}


STUDY_PACK_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["schema_version", "summary", "keywords", "flashcards", "strategies"],
    "properties": {
        "schema_version": {"type": "string", "enum": ["reviss.study_pack.v1"]},
        "summary": {
            "type": "object",
            "additionalProperties": False,
            "required": ["content", "estimated_reading_minutes"],
            "properties": {
                "content": {"type": "string", "maxLength": 120000},
                "estimated_reading_minutes": {"type": "integer"},
            },
        },
        "keywords": {
            "type": "array",
            "maxItems": 80,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["term", "explanation", "anchor_text"],
                "properties": {
                    "term": {"type": "string", "maxLength": 180},
                    "explanation": {"type": "string", "maxLength": 1200},
                    "anchor_text": {"type": "string", "maxLength": 240},
                },
            },
        },
        "flashcards": {
            "type": "array",
            "maxItems": 140,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["front", "back", "category", "difficulty"],
                "properties": {
                    "front": {"type": "string", "maxLength": 1200},
                    "back": {"type": "string", "maxLength": 1800},
                    "category": {"type": "string", "maxLength": 120},
                    "difficulty": {"type": "string", "enum": ["low", "medium", "high"]},
                },
            },
        },
        "strategies": {
            "type": "array",
            "maxItems": 30,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["title", "description"],
                "properties": {
                    "title": {"type": "string", "maxLength": 180},
                    "description": {"type": "string", "maxLength": 1600},
                },
            },
        },
    },
}


SINGLE_QUIZ_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["schema_version", "quiz"],
    "properties": {
        "schema_version": {"type": "string", "enum": ["reviss.quiz.v2"]},
        "quiz": {
            "type": "object",
            "additionalProperties": False,
            "required": ["title", "description", "complexity", "questions"],
            "properties": {
                "title": {"type": "string", "maxLength": 180},
                "description": {"type": "string", "maxLength": 1000},
                "complexity": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "exam"],
                },
                "questions": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 50,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "prompt",
                            "type",
                            "options",
                            "explanation",
                            "concept",
                            "review_section",
                            "review_paragraph_index",
                            "review_anchor_text",
                            "review_advice",
                        ],
                        "properties": {
                            "prompt": {"type": "string", "maxLength": 1600},
                            "type": {
                                "type": "string",
                                "enum": [
                                    "single_choice",
                                    "multiple_choice",
                                    "matching",
                                    "ordering",
                                    "cloze",
                                ],
                            },
                            # One shape for every type, so the model never has
                            # to pick between competing option schemas:
                            #   single/multiple -> label + is_correct
                            #   matching        -> label + match_label
                            #   ordering        -> label + position
                            "options": {
                                "type": "array",
                                "minItems": 2,
                                "maxItems": 8,
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "required": [
                                        "label",
                                        "is_correct",
                                        "match_label",
                                        "position",
                                    ],
                                    "properties": {
                                        "label": {
                                            "type": "string",
                                            "maxLength": 600,
                                        },
                                        "is_correct": {"type": "boolean"},
                                        "match_label": {
                                            "type": ["string", "null"],
                                            "maxLength": 600,
                                        },
                                        "position": {
                                            "type": ["integer", "null"],
                                            "minimum": 1,
                                            "maximum": 30,
                                        },
                                    },
                                },
                            },
                            "explanation": {"type": "string", "maxLength": 1600},
                            "concept": {
                                "type": "string",
                                "minLength": 2,
                                "maxLength": 180,
                            },
                            "review_section": {"type": "string", "maxLength": 1200},
                            "review_paragraph_index": {"type": "integer", "minimum": 0},
                            "review_anchor_text": {
                                "type": "string",
                                "minLength": 8,
                                "maxLength": 240,
                            },
                            "review_advice": {
                                "type": "string",
                                "minLength": 12,
                                "maxLength": 700,
                            },
                        },
                    },
                },
            },
        },
    },
}

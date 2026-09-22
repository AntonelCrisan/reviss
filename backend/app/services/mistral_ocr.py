from __future__ import annotations

import base64
import json
import logging
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from anyio import to_thread

from app.core.config import Settings

MISTRAL_OCR_PAGE_SEPARATOR = "\n\n---\n\n"
logger = logging.getLogger("revizzio.mistral_ocr")


class MistralOCRConfigurationError(Exception):
    pass


class MistralOCRRequestError(Exception):
    pass


class MistralOCRServiceError(MistralOCRRequestError):
    """The OCR service refused the call or could not be reached.

    The document itself may be perfectly readable, so the student must not be
    told to take a clearer photo: an account without OCR access, a rate limit
    or an outage all end up here.
    """


# The media type Mistral needs for each kind of image we accept.
IMAGE_MEDIA_TYPES: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


async def extract_scanned_pdf_markdown(
    path: Path, settings: Settings
) -> tuple[str, int]:
    return await to_thread.run_sync(_extract_ocr_markdown_sync, path, settings, False)


async def extract_image_markdown(
    path: Path, settings: Settings
) -> tuple[str, int]:
    """Read a photo of a page through the same OCR as a scanned document.

    A picture of a course handout is a scanned document that happens to be
    framed by hand, so it goes to the same service rather than a second one.
    """
    return await to_thread.run_sync(_extract_ocr_markdown_sync, path, settings, True)


def _ocr_document_payload(path: Path, is_image: bool) -> dict[str, str]:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")

    if not is_image:
        return {
            "type": "document_url",
            "document_url": f"data:application/pdf;base64,{encoded}",
        }

    media_type = IMAGE_MEDIA_TYPES.get(path.suffix.lower())
    if media_type is None:
        raise MistralOCRRequestError(
            f"Formatul de imagine {path.suffix or '(fara extensie)'} nu poate fi citit."
        )
    return {
        "type": "image_url",
        "image_url": f"data:{media_type};base64,{encoded}",
    }


def _extract_ocr_markdown_sync(
    path: Path, settings: Settings, is_image: bool
) -> tuple[str, int]:
    if settings.mistral_api_key is None:
        raise MistralOCRConfigurationError("MISTRAL_API_KEY nu este configurat.")

    logger.info(
        "Mistral OCR pornit pentru %s: %s",
        "imagine" if is_image else "PDF scanat",
        path.name,
    )
    payload = {
        "model": settings.mistral_ocr_model,
        "document": _ocr_document_payload(path, is_image),
        "include_blocks": False,
        "include_image_base64": False,
        "table_format": "markdown",
    }
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        settings.mistral_ocr_api_url,
        data=body,
        method="POST",
        headers={
            "Authorization": (
                f"Bearer {settings.mistral_api_key.get_secret_value()}"
            ),
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Reviss/1.0",
        },
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=settings.mistral_ocr_timeout_seconds,
        ) as response:
            response_body = response.read()
    except urllib.error.HTTPError as exc:
        response_body = exc.read()
        detail = _mistral_error_message(response_body)
        # The reason (a 429 with a limit of 0, a 401, an outage) is what tells
        # an account problem from a bad document, so it has to reach the log.
        logger.warning(
            "Mistral OCR a raspuns %s pentru %s: %s (limita cereri/minut: %s)",
            exc.code,
            path.name,
            detail,
            exc.headers.get("x-ratelimit-limit-req-minute") if exc.headers else None,
        )
        raise MistralOCRServiceError(
            f"Mistral OCR a refuzat procesarea: {detail}"
        ) from exc
    except urllib.error.URLError as exc:
        logger.warning("Mistral OCR nu a putut fi contactat: %s", exc.reason)
        raise MistralOCRServiceError(
            "Mistral OCR nu a putut fi contactat."
        ) from exc
    except TimeoutError as exc:
        logger.warning("Mistral OCR nu a raspuns in timp util pentru %s.", path.name)
        raise MistralOCRServiceError(
            "Mistral OCR nu a raspuns in timp util."
        ) from exc

    try:
        response_payload = json.loads(response_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MistralOCRServiceError(
            "Mistral OCR a returnat un raspuns invalid."
        ) from exc

    markdown = _combine_ocr_page_markdown(response_payload)
    page_count = _ocr_page_count(response_payload)
    logger.info(
        "Mistral OCR finalizat pentru %s: %s pagini, %s caractere markdown.",
        path.name,
        page_count,
        len(markdown),
    )
    return markdown, page_count


def _combine_ocr_page_markdown(response_payload: dict[str, Any]) -> str:
    pages = response_payload.get("pages")
    if not isinstance(pages, list):
        raise MistralOCRRequestError(
            "Mistral OCR nu a returnat paginile documentului."
        )

    markdown_parts: list[str] = []
    for page in pages:
        if not isinstance(page, dict):
            continue
        markdown = page.get("markdown")
        if isinstance(markdown, str) and markdown.strip():
            markdown_parts.append(markdown.strip())

    markdown = _clean_ocr_markdown(MISTRAL_OCR_PAGE_SEPARATOR.join(markdown_parts))
    if not markdown:
        raise MistralOCRRequestError(
            "Mistral OCR nu a extras text din document."
        )
    return markdown


def _mistral_error_message(response_body: bytes) -> str:
    response_text = response_body.decode("utf-8", errors="replace").strip()
    if not response_text:
        return "raspuns gol"

    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError:
        return response_text[:500]

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message") or error.get("detail")
            if isinstance(message, str) and message.strip():
                return message.strip()[:500]
        detail = payload.get("detail") or payload.get("message")
        if isinstance(detail, str) and detail.strip():
            return detail.strip()[:500]
    return response_text[:500]


def _ocr_page_count(response_payload: dict[str, Any]) -> int:
    pages = response_payload.get("pages")
    return len(pages) if isinstance(pages, list) else 0


def _clean_ocr_markdown(value: str) -> str:
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value).strip()

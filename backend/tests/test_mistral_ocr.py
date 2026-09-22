from __future__ import annotations

import asyncio
import json
import urllib.request

import pytest

from app.core.config import Settings
from app.services.mistral_ocr import (
    MistralOCRConfigurationError,
    extract_scanned_pdf_markdown,
)

BASE_SETTINGS = {
    "database_url": "postgresql+asyncpg://user:password@localhost:5432/revizzio",
    "session_secret": "a-secure-session-secret-with-more-than-32-characters",
}


class _FakeOCRResponse:
    def __enter__(self) -> _FakeOCRResponse:
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(
            {
                "pages": [
                    {"index": 0, "markdown": "# Pagina 1\nText extras."},
                    {"index": 1, "markdown": "# Pagina 2\nAlt text extras."},
                ],
            }
        ).encode("utf-8")


def test_mistral_ocr_sends_base64_pdf_and_combines_markdown(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pdf_path = tmp_path / "scan.pdf"
    pdf_path.write_bytes(b"%PDF-1.7\nfake content")
    settings = Settings(
        **BASE_SETTINGS,
        mistral_api_key="mistral-test-key",
        mistral_ocr_timeout_seconds=42,
    )
    captured: dict[str, object] = {}

    def fake_urlopen(
        request: urllib.request.Request,
        timeout: int,
    ) -> _FakeOCRResponse:
        captured["timeout"] = timeout
        captured["url"] = request.full_url
        captured["authorization"] = request.get_header("Authorization")
        assert request.data is not None
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        return _FakeOCRResponse()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    markdown, page_count = asyncio.run(extract_scanned_pdf_markdown(pdf_path, settings))

    payload = captured["payload"]
    assert captured["timeout"] == 42
    assert captured["url"] == "https://api.mistral.ai/v1/ocr"
    assert captured["authorization"] == "Bearer mistral-test-key"
    assert payload["model"] == "mistral-ocr-latest"
    assert payload["document"]["type"] == "document_url"
    assert payload["document"]["document_url"].startswith(
        "data:application/pdf;base64,"
    )
    assert payload["include_image_base64"] is False
    assert "# Pagina 1" in markdown
    assert "# Pagina 2" in markdown
    assert page_count == 2


def test_mistral_ocr_requires_api_key(tmp_path) -> None:
    pdf_path = tmp_path / "scan.pdf"
    pdf_path.write_bytes(b"%PDF-1.7\nfake content")
    settings = Settings(**BASE_SETTINGS, mistral_api_key="")

    with pytest.raises(MistralOCRConfigurationError):
        asyncio.run(extract_scanned_pdf_markdown(pdf_path, settings))


def test_a_refused_ocr_call_is_a_service_error_not_a_bad_document(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import io
    import urllib.error
    from email.message import Message

    from app.services.mistral_ocr import (
        MistralOCRServiceError,
        extract_image_markdown,
    )

    image_path = tmp_path / "pagina.png"
    image_path.write_bytes(b"\x89PNG\r\n\x1a\nfake image")
    settings = Settings(**BASE_SETTINGS, mistral_api_key="mistral-test-key")

    def refuse(request: urllib.request.Request, timeout: int) -> None:
        # What an account without OCR access gets back: a 429 with a limit of 0.
        headers = Message()
        headers["x-ratelimit-limit-req-minute"] = "0"
        body = json.dumps({"message": "Rate limit exceeded", "type": "rate_limited"})
        raise urllib.error.HTTPError(
            request.full_url,
            429,
            "Too Many Requests",
            headers,
            io.BytesIO(body.encode()),
        )

    monkeypatch.setattr(urllib.request, "urlopen", refuse)

    with pytest.raises(MistralOCRServiceError, match="Rate limit exceeded"):
        asyncio.run(extract_image_markdown(image_path, settings))

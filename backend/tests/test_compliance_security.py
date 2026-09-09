import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.routes import compliance
from app.core.config import Settings
from app.schemas.compliance import (
    ContactRequest,
    ContentReportRequestPayload,
    WithdrawalRequestPayload,
)
from app.services.email import EmailMessage, EmailService

BASE_SETTINGS = {
    "database_url": "postgresql+asyncpg://user:password@localhost:5432/revizzio",
    "session_secret": "a-secure-session-secret-with-more-than-32-characters",
}


def build_settings(**updates: object) -> Settings:
    return Settings(**{**BASE_SETTINGS, **updates})


def build_request(
    *,
    path: str = "/api/compliance/contact",
    headers: dict[str, str] | None = None,
) -> Request:
    raw_headers = [
        (name.lower().encode("latin-1"), value.encode("latin-1"))
        for name, value in (headers or {}).items()
    ]
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "https",
            "path": path,
            "raw_path": path.encode("latin-1"),
            "query_string": b"",
            "headers": raw_headers,
            "client": ("10.0.0.5", 49152),
            "server": ("testserver", 443),
        }
    )


def build_contact_payload() -> ContactRequest:
    return ContactRequest(
        name="Student Test",
        email="student@example.com",
        category="suport",
        subject="Ajutor cont",
        message="Am nevoie de ajutor cu platforma Reviss.",
        recaptcha_token="secret-token",
    )


def build_content_report_payload(
    report_type: str = "continut_incorect",
) -> ContentReportRequestPayload:
    return ContentReportRequestPayload(
        name="Student Test",
        email="student@example.com",
        report_type=report_type,
        content_reference="Proiect Pharma / card 12",
        description="Conținutul generat pare incorect și trebuie analizat.",
        rights_evidence="Context suplimentar pentru echipa Reviss.",
        declaration=True,
        recaptcha_token="secret-token",
    )


def build_withdrawal_payload() -> WithdrawalRequestPayload:
    return WithdrawalRequestPayload(
        full_name="Student Test",
        email="student@example.com",
        subscription_or_order="Focus lunar",
        order_number="INV-123",
        reason="Solicit retragerea din contract.",
        confirmation=True,
        recaptcha_token="secret-token",
    )


class ContactEmailSession:
    def __init__(
        self,
        company_email: str | None = "support@reviss.test",
        privacy_email: str | None = "privacy@reviss.test",
    ) -> None:
        self.company_email = company_email
        self.privacy_email = privacy_email
        self.events: list[object] = []
        self.commits = 0

    async def scalar(self, _: object) -> object | None:
        if self.company_email is None:
            return None
        return SimpleNamespace(
            email=self.company_email,
            privacy_email=self.privacy_email,
        )

    def add(self, event: object) -> None:
        self.events.append(event)

    async def commit(self) -> None:
        self.commits += 1


@pytest.fixture(autouse=True)
def clear_compliance_rate_limiter() -> None:
    compliance._rate_limit_buckets.clear()
    yield
    compliance._rate_limit_buckets.clear()


def test_contact_rate_limit_uses_forwarded_client_ip() -> None:
    settings = build_settings(
        cors_origins="https://www.reviss.app",
        contact_rate_limit_window_seconds=600,
        contact_rate_limit_max_requests=2,
    )
    headers = {
        "origin": "https://www.reviss.app",
        "x-reviss-form-intent": "contact",
        "x-forwarded-for": "10.0.0.5, 198.51.100.24",
    }

    asyncio.run(
        compliance.protect_form_request(build_request(headers=headers), settings)
    )
    asyncio.run(
        compliance.protect_form_request(build_request(headers=headers), settings)
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            compliance.protect_form_request(build_request(headers=headers), settings)
        )

    assert exc_info.value.status_code == 429

    other_ip_headers = {
        **headers,
        "x-forwarded-for": "10.0.0.5, 203.0.113.9",
    }
    asyncio.run(
        compliance.protect_form_request(
            build_request(headers=other_ip_headers),
            settings,
        )
    )


def test_contact_payload_does_not_persist_recaptcha_token() -> None:
    payload = build_contact_payload()

    assert "recaptcha_token" not in compliance._payload(payload)


def test_content_report_payload_does_not_persist_recaptcha_token() -> None:
    payload = build_content_report_payload()

    assert "recaptcha_token" not in compliance._payload(payload)


def test_withdrawal_payload_does_not_persist_recaptcha_token() -> None:
    payload = build_withdrawal_payload()

    assert "recaptcha_token" not in compliance._payload(payload)


def test_content_report_rate_limit_uses_forwarded_client_ip() -> None:
    settings = build_settings(
        cors_origins="https://www.reviss.app",
        content_report_rate_limit_window_seconds=600,
        content_report_rate_limit_max_requests=1,
    )
    headers = {
        "origin": "https://www.reviss.app",
        "x-reviss-form-intent": "content-report",
        "x-forwarded-for": "10.0.0.5, 198.51.100.24",
    }
    request = build_request(
        path="/api/compliance/content-report",
        headers=headers,
    )

    asyncio.run(compliance.protect_form_request(request, settings))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(compliance.protect_form_request(request, settings))

    assert exc_info.value.status_code == 429


def test_withdrawal_rate_limit_uses_forwarded_client_ip() -> None:
    settings = build_settings(
        cors_origins="https://www.reviss.app",
        contact_rate_limit_window_seconds=600,
        contact_rate_limit_max_requests=1,
    )
    headers = {
        "origin": "https://www.reviss.app",
        "x-reviss-form-intent": "withdrawal",
        "x-forwarded-for": "10.0.0.5, 198.51.100.24",
    }
    request = build_request(
        path="/api/compliance/withdrawal",
        headers=headers,
    )

    asyncio.run(compliance.protect_form_request(request, settings))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(compliance.protect_form_request(request, settings))

    assert exc_info.value.status_code == 429


def test_content_report_attachment_filename_is_sanitized_and_keeps_extension() -> None:
    safe_name = compliance._safe_attachment_filename(
        "../contract<script>" + ("x" * 280) + ".PDF"
    )

    assert ".." not in safe_name
    assert "<" not in safe_name
    assert len(safe_name) <= 255
    assert safe_name.lower().endswith(".pdf")


def test_content_report_attachment_rejects_invalid_pdf_signature() -> None:
    with pytest.raises(compliance.ContentReportAttachmentError):
        compliance._validate_attachment_signature("dovada.pdf", b"not-a-pdf")


def test_contact_emails_send_confirmation_and_internal_notification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent_messages: list[EmailMessage] = []

    async def fake_send(_: EmailService, message: EmailMessage) -> None:
        sent_messages.append(message)

    monkeypatch.setattr(EmailService, "send", fake_send)
    session = ContactEmailSession()

    confirmation_sent = asyncio.run(
        compliance._send_contact_emails(
            payload=build_contact_payload(),
            reference="CON-20260825-ABCDEF12",
            session=session,
            settings=build_settings(
                resend_api_key="re_test",
                public_app_url="https://www.reviss.app",
            ),
            ip_address="198.51.100.24",
            user_agent="pytest",
        )
    )

    assert confirmation_sent is True
    assert [message.to for message in sent_messages] == [
        "student@example.com",
        "support@reviss.test",
    ]
    assert sent_messages[0].reply_to is None
    assert sent_messages[1].reply_to == "student@example.com"
    assert sent_messages[1].subject == "Mesaj nou Reviss: Ajutor cont"
    assert [event.event_type for event in session.events] == [
        "contact_email_sent",
        "contact_email_sent",
    ]
    assert session.commits == 2


def test_content_report_emails_send_confirmation_and_internal_notification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent_messages: list[EmailMessage] = []

    async def fake_send(_: EmailService, message: EmailMessage) -> None:
        sent_messages.append(message)

    monkeypatch.setattr(EmailService, "send", fake_send)
    session = ContactEmailSession()

    confirmation_sent = asyncio.run(
        compliance._send_content_report_emails(
            payload=build_content_report_payload(),
            reference="RAP-20260825-ABCDEF12",
            attachments=[],
            session=session,
            settings=build_settings(
                resend_api_key="re_test",
                public_app_url="https://www.reviss.app",
            ),
            ip_address="198.51.100.24",
            user_agent="pytest",
        )
    )

    assert confirmation_sent is True
    assert [message.to for message in sent_messages] == [
        "student@example.com",
        "support@reviss.test",
    ]
    assert sent_messages[0].reply_to is None
    assert sent_messages[1].reply_to == "student@example.com"
    assert sent_messages[1].subject == (
        "Raportare conținut Reviss: Proiect Pharma / card 12"
    )
    assert [event.event_type for event in session.events] == [
        "content_report_email_sent",
        "content_report_email_sent",
    ]
    assert session.commits == 2


def test_withdrawal_emails_send_confirmation_and_internal_notification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent_messages: list[EmailMessage] = []

    async def fake_send(_: EmailService, message: EmailMessage) -> None:
        sent_messages.append(message)

    monkeypatch.setattr(EmailService, "send", fake_send)
    session = ContactEmailSession()

    confirmation_sent = asyncio.run(
        compliance._send_withdrawal_emails(
            payload=build_withdrawal_payload(),
            reference="RET-20260825-ABCDEF12",
            session=session,
            settings=build_settings(
                resend_api_key="re_test",
                public_app_url="https://www.reviss.app",
            ),
            ip_address="198.51.100.24",
            user_agent="pytest",
        )
    )

    assert confirmation_sent is True
    assert [message.to for message in sent_messages] == [
        "student@example.com",
        "support@reviss.test",
    ]
    assert sent_messages[0].reply_to is None
    assert sent_messages[1].reply_to == "student@example.com"
    assert sent_messages[1].subject == (
        "Retragere contract Reviss: RET-20260825-ABCDEF12"
    )
    assert [event.event_type for event in session.events] == [
        "withdrawal_email_sent",
        "withdrawal_email_sent",
    ]
    assert session.commits == 2


def test_email_subjects_strip_user_control_whitespace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent_messages: list[EmailMessage] = []

    async def fake_send(_: EmailService, message: EmailMessage) -> None:
        sent_messages.append(message)

    monkeypatch.setattr(EmailService, "send", fake_send)
    payload = build_content_report_payload()
    payload.content_reference = "Card 12\r\nBcc: attacker@example.com"

    asyncio.run(
        compliance._send_content_report_emails(
            payload=payload,
            reference="RAP-20260825-ABCDEF12",
            attachments=[],
            session=ContactEmailSession(),
            settings=build_settings(
                resend_api_key="re_test",
                public_app_url="https://www.reviss.app",
            ),
            ip_address="198.51.100.24",
            user_agent="pytest",
        )
    )

    assert sent_messages[1].subject == (
        "Raportare conținut Reviss: Card 12 Bcc: attacker@example.com"
    )


def test_content_report_email_notification_uses_privacy_email_for_personal_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent_messages: list[EmailMessage] = []

    async def fake_send(_: EmailService, message: EmailMessage) -> None:
        sent_messages.append(message)

    monkeypatch.setattr(EmailService, "send", fake_send)
    session = ContactEmailSession()

    asyncio.run(
        compliance._send_content_report_emails(
            payload=build_content_report_payload(report_type="date_personale"),
            reference="RAP-20260825-ABCDEF12",
            attachments=[],
            session=session,
            settings=build_settings(
                resend_api_key="re_test",
                public_app_url="https://www.reviss.app",
            ),
            ip_address="198.51.100.24",
            user_agent="pytest",
        )
    )

    assert [message.to for message in sent_messages] == [
        "student@example.com",
        "privacy@reviss.test",
    ]


def test_contact_email_notification_is_skipped_when_company_email_is_placeholder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent_messages: list[EmailMessage] = []

    async def fake_send(_: EmailService, message: EmailMessage) -> None:
        sent_messages.append(message)

    monkeypatch.setattr(EmailService, "send", fake_send)
    session = ContactEmailSession(company_email="[EMAIL_CONTACT]")

    confirmation_sent = asyncio.run(
        compliance._send_contact_emails(
            payload=build_contact_payload(),
            reference="CON-20260825-ABCDEF12",
            session=session,
            settings=build_settings(
                resend_api_key="re_test",
                public_app_url="https://www.reviss.app",
            ),
            ip_address="198.51.100.24",
            user_agent="pytest",
        )
    )

    assert confirmation_sent is True
    assert [message.to for message in sent_messages] == ["student@example.com"]
    assert [event.event_type for event in session.events] == [
        "contact_email_sent",
        "contact_email_skipped",
    ]
    assert session.events[1].payload["email_type"] == "notification"
    assert session.commits == 2


def test_contact_recaptcha_is_required_in_production_when_not_configured() -> None:
    settings = build_settings(
        environment="production",
        session_cookie_secure=True,
        public_app_url="https://reviss.app",
        recaptcha_secret_key=None,
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            compliance.verify_contact_recaptcha("", build_request(), settings)
        )

    assert exc_info.value.status_code == 503


def test_contact_recaptcha_rejects_missing_token_when_configured() -> None:
    settings = build_settings(recaptcha_secret_key="recaptcha-secret")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            compliance.verify_contact_recaptcha("", build_request(), settings)
        )

    assert exc_info.value.status_code == 400


def test_contact_recaptcha_sends_clean_token_and_forwarded_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []

    def fake_post_recaptcha_verification(**kwargs: object) -> dict[str, object]:
        calls.append(kwargs)
        return {"success": True}

    monkeypatch.setattr(
        compliance,
        "_post_recaptcha_verification",
        fake_post_recaptcha_verification,
    )
    settings = build_settings(recaptcha_secret_key="recaptcha-secret")
    request = build_request(headers={"x-forwarded-for": "10.0.0.5, 198.51.100.24"})

    asyncio.run(
        compliance.verify_contact_recaptcha("  valid-token  ", request, settings)
    )

    assert calls == [
        {
            "verify_url": "https://www.google.com/recaptcha/api/siteverify",
            "secret": "recaptcha-secret",
            "token": "valid-token",
            "remote_ip": "198.51.100.24",
        }
    ]


def test_contact_recaptcha_rejects_failed_google_verification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        compliance,
        "_post_recaptcha_verification",
        lambda **_: {"success": False},
    )
    settings = build_settings(recaptcha_secret_key="recaptcha-secret")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            compliance.verify_contact_recaptcha(
                "invalid-token",
                build_request(),
                settings,
            )
        )

    assert exc_info.value.status_code == 400

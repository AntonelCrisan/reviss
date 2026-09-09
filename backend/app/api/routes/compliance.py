import asyncio
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from starlette.datastructures import UploadFile as StarletteUploadFile

from app.api.dependencies import AppSettings, CurrentUser, DbSession
from app.api.security import client_ip
from app.core.config import Settings
from app.core.rate_limit import _memory_rate_limit_buckets, consume_rate_limit
from app.models import (
    CompanyData,
    ComplianceEvent,
    ContactMessage,
    ContentReport,
    ContentReportAttachment,
    SubscriptionCancellation,
    WithdrawalRequest,
)
from app.schemas.compliance import (
    ComplianceResponse,
    ContactRequest,
    ContentReportRequestPayload,
    CookieConsentRequest,
    SubscriptionCancellationRequest,
    WithdrawalRequestPayload,
)
from app.services.email import (
    EmailDeliveryError,
    EmailMessage,
    EmailService,
    contact_confirmation_email,
    contact_notification_email,
    content_report_confirmation_email,
    content_report_notification_email,
    email_logo_html,
    withdrawal_confirmation_email,
    withdrawal_notification_email,
)

router = APIRouter(prefix="/api/compliance", tags=["compliance"])
logger = logging.getLogger("revizzio.compliance")

MAX_USER_AGENT_LENGTH = 512
RATE_LIMIT_WINDOW_SECONDS = 600
RATE_LIMIT_MAX_REQUESTS = 30
RECAPTCHA_TIMEOUT_SECONDS = 5
CONTENT_REPORT_ATTACHMENT_CHUNK_BYTES = 1024 * 1024
CONTENT_REPORT_ATTACHMENT_SIGNATURE_BYTES = 16
_rate_limit_buckets = _memory_rate_limit_buckets
CONTACT_CATEGORY_LABELS = {
    "suport": "Suport",
    "facturare": "Facturare",
    "confidentialitate": "Confidențialitate",
    "raportare_continut": "Raportare conținut",
}
CONTENT_REPORT_TYPE_LABELS = {
    "drepturi_autor": "Drepturi de autor",
    "date_personale": "Date personale",
    "continut_incorect": "Conținut incorect",
    "altul": "Alt motiv",
}
CONTENT_REPORT_ATTACHMENT_EXTENSIONS = {
    ".doc",
    ".docx",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".rtf",
    ".txt",
    ".webp",
}
SAFE_ATTACHMENT_NAME_PATTERN = re.compile(r"[^A-Za-z0-9._ -]+")
TRUE_FORM_VALUES = {"1", "true", "t", "yes", "y", "on"}


class ContentReportAttachmentError(Exception):
    pass


def _client_ip(request: Request) -> str | None:
    return client_ip(request)


def _client_context(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    if user_agent is not None:
        user_agent = user_agent[:MAX_USER_AGENT_LENGTH]
    ip_address = _client_ip(request)
    return user_agent, ip_address


def _registration_number(prefix: str) -> str:
    today = datetime.now(UTC).strftime("%Y%m%d")
    suffix = uuid.uuid4().hex[:8].upper()
    return f"{prefix}-{today}-{suffix}"


def _contact_reference(contact_message_id: uuid.UUID) -> str:
    today = datetime.now(UTC).strftime("%Y%m%d")
    suffix = contact_message_id.hex[:8].upper()
    return f"CON-{today}-{suffix}"


def _safe_attachment_filename(filename: str) -> str:
    raw_filename = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
    safe_filename = SAFE_ATTACHMENT_NAME_PATTERN.sub("_", raw_filename)
    safe_filename = " ".join(safe_filename.split()).strip(" .")
    if not safe_filename:
        safe_filename = "document"

    extension = Path(safe_filename).suffix.lower()
    if extension not in CONTENT_REPORT_ATTACHMENT_EXTENSIONS:
        allowed = ", ".join(sorted(CONTENT_REPORT_ATTACHMENT_EXTENSIONS))
        raise ContentReportAttachmentError(
            f"Documentul {safe_filename} nu este acceptat. Folosește: {allowed}."
        )

    if len(safe_filename) <= 255:
        return safe_filename

    stem = Path(safe_filename).stem[: 255 - len(extension)]
    return f"{stem}{extension}"


def _validate_attachment_signature(
    filename: str,
    signature: bytes,
) -> None:
    extension = Path(filename).suffix.lower()

    checks: dict[str, tuple[bytes, str]] = {
        ".doc": (
            b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",
            "Documentul DOC nu pare valid.",
        ),
        ".docx": (b"PK", "Documentul DOCX nu pare valid."),
        ".jpeg": (b"\xff\xd8\xff", "Imaginea JPEG nu pare validă."),
        ".jpg": (b"\xff\xd8\xff", "Imaginea JPG nu pare validă."),
        ".pdf": (b"%PDF", "Documentul PDF nu pare valid."),
        ".png": (b"\x89PNG\r\n\x1a\n", "Imaginea PNG nu pare validă."),
        ".rtf": (b"{\\rtf", "Documentul RTF nu pare valid."),
        ".webp": (b"RIFF", "Imaginea WEBP nu pare validă."),
    }
    expected_signature = checks.get(extension)
    if expected_signature is None:
        return

    prefix, error_message = expected_signature
    if not signature.startswith(prefix):
        raise ContentReportAttachmentError(error_message)

    if extension == ".webp" and signature[8:12] != b"WEBP":
        raise ContentReportAttachmentError("Imaginea WEBP nu pare validă.")


def _attachment_storage_dir(settings: Settings, reference: str) -> Path:
    storage_root = settings.content_report_storage_dir.resolve()
    attachment_dir = (
        storage_root / datetime.now(UTC).strftime("%Y%m%d") / reference
    ).resolve()
    if storage_root != attachment_dir and storage_root not in attachment_dir.parents:
        raise ContentReportAttachmentError(
            "Documentele nu pot fi salvate în afara directorului configurat."
        )
    return attachment_dir


def _cleanup_attachment_paths(paths: list[Path]) -> None:
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            continue


def _configured_email(value: str | None) -> str | None:
    if value is None:
        return None
    email = value.strip()
    if not email or (email.startswith("[") and email.endswith("]")):
        return None
    if "@" not in email or email.startswith("@"):
        return None
    return email[:320]


async def _contact_notification_recipient(session: DbSession) -> str | None:
    company_data = await session.scalar(select(CompanyData).order_by(CompanyData.id))
    if company_data is None:
        return None
    return _configured_email(company_data.email)


async def _content_report_notification_recipient(
    session: DbSession,
    report_type: str,
) -> str | None:
    company_data = await session.scalar(select(CompanyData).order_by(CompanyData.id))
    if company_data is None:
        return None

    primary_email = _configured_email(company_data.email)
    privacy_email = _configured_email(company_data.privacy_email)
    if report_type == "date_personale":
        return privacy_email or primary_email
    return primary_email or privacy_email


def _validation_error_detail(exc: ValidationError) -> list[dict[str, object]]:
    details: list[dict[str, object]] = []
    for error in exc.errors():
        detail: dict[str, object] = {
            "loc": list(error.get("loc", ())),
            "msg": str(error.get("msg", "Valoare invalidă.")),
            "type": str(error.get("type", "value_error")),
        }
        ctx = error.get("ctx")
        if isinstance(ctx, dict):
            detail["ctx"] = {
                str(key): value
                for key, value in ctx.items()
                if isinstance(value, (str, int, float, bool, type(None)))
            }
        details.append(detail)
    return details


def _form_text(form: object, field: str) -> str:
    value = form.get(field)  # type: ignore[attr-defined]
    if value is None or isinstance(value, StarletteUploadFile):
        return ""
    return str(value)


def _form_bool(form: object, field: str) -> bool:
    value = form.get(field)  # type: ignore[attr-defined]
    if value is None or isinstance(value, StarletteUploadFile):
        return False
    return str(value).strip().lower() in TRUE_FORM_VALUES


def _content_report_uploads(form: object) -> list[StarletteUploadFile]:
    uploads: list[StarletteUploadFile] = []
    for field in ("attachments", "attachments[]", "documents", "documents[]"):
        for value in form.getlist(field):  # type: ignore[attr-defined]
            if isinstance(value, StarletteUploadFile) and value.filename:
                uploads.append(value)
    return uploads


async def _parse_content_report_payload(
    request: Request,
) -> tuple[ContentReportRequestPayload, list[StarletteUploadFile]]:
    content_type = request.headers.get("content-type", "").lower()

    if content_type.startswith("multipart/form-data"):
        try:
            form = await request.form()
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=[
                    {
                        "loc": ["body", "form"],
                        "msg": "Formular multipart invalid sau incomplet.",
                    }
                ],
            ) from exc

        data = {
            "name": _form_text(form, "name"),
            "email": _form_text(form, "email"),
            "report_type": _form_text(form, "report_type"),
            "content_reference": _form_text(form, "content_reference"),
            "description": _form_text(form, "description"),
            "rights_evidence": _form_text(form, "rights_evidence"),
            "declaration": _form_bool(form, "declaration"),
            "recaptcha_token": _form_text(form, "recaptcha_token"),
        }
        try:
            return (
                ContentReportRequestPayload.model_validate(data),
                _content_report_uploads(form),
            )
        except ValidationError as exc:
            raise HTTPException(
                status_code=422,
                detail=_validation_error_detail(exc),
            ) from exc

    try:
        body = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail="Corpul solicitării trebuie să fie JSON sau multipart valid.",
        ) from exc

    try:
        return ContentReportRequestPayload.model_validate(body), []
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=_validation_error_detail(exc),
        ) from exc


def _payload(data: Any) -> dict[str, object]:
    if not hasattr(data, "model_dump"):
        return {}
    return data.model_dump(mode="json", exclude={"recaptcha_token"})


def _email_event_payload(
    *,
    reference: str,
    email_type: str,
    recipient: str | None,
    error: str | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "reference": reference,
        "email_type": email_type,
    }
    if recipient:
        payload["recipient"] = recipient
    if error:
        payload["error"] = error[:500]
    return payload


def _email_subject(prefix: str, value: str, max_value_length: int = 120) -> str:
    normalized_value = " ".join(value.split()).strip()
    if not normalized_value:
        normalized_value = "fără subiect"
    if len(normalized_value) > max_value_length:
        normalized_value = f"{normalized_value[:max_value_length].rstrip()}..."
    return f"{prefix}: {normalized_value}"


def _attachment_event_payload(
    attachments: list[ContentReportAttachment],
) -> list[dict[str, object]]:
    return [
        {
            "id": str(attachment.id),
            "filename": attachment.original_filename,
            "content_type": attachment.content_type,
            "size_bytes": attachment.size_bytes,
        }
        for attachment in attachments
    ]


async def _store_content_report_attachment(
    *,
    report: ContentReport,
    reference: str,
    upload: StarletteUploadFile,
    upload_index: int,
    settings: Settings,
    stored_paths: list[Path],
) -> ContentReportAttachment:
    safe_name = _safe_attachment_filename(upload.filename or "document")
    attachment_dir = _attachment_storage_dir(settings, reference)
    extension = Path(safe_name).suffix.lower()
    storage_name = f"{upload_index + 1:02d}-{uuid.uuid4().hex[:16]}{extension}"
    storage_path = attachment_dir / storage_name
    temp_storage_path = attachment_dir / f"u-{uuid.uuid4().hex[:16]}.tmp"
    max_bytes = settings.content_report_attachment_max_mb * 1024 * 1024
    size_bytes = 0
    signature = bytearray()

    try:
        attachment_dir.mkdir(parents=True, exist_ok=True)
        with temp_storage_path.open("wb") as destination:
            while chunk := await upload.read(CONTENT_REPORT_ATTACHMENT_CHUNK_BYTES):
                size_bytes += len(chunk)
                if size_bytes > max_bytes:
                    raise ContentReportAttachmentError(
                        f"Documentul {safe_name} depășește limita de "
                        f"{settings.content_report_attachment_max_mb}MB."
                    )
                if len(signature) < CONTENT_REPORT_ATTACHMENT_SIGNATURE_BYTES:
                    signature.extend(
                        chunk[
                            : CONTENT_REPORT_ATTACHMENT_SIGNATURE_BYTES
                            - len(signature)
                        ]
                    )
                destination.write(chunk)

        if size_bytes == 0:
            raise ContentReportAttachmentError(f"Documentul {safe_name} este gol.")

        _validate_attachment_signature(safe_name, bytes(signature))
        temp_storage_path.replace(storage_path)
        stored_paths.append(storage_path)
    except ContentReportAttachmentError:
        temp_storage_path.unlink(missing_ok=True)
        raise
    except OSError as exc:
        temp_storage_path.unlink(missing_ok=True)
        raise ContentReportAttachmentError(
            f"Documentul {safe_name} nu a putut fi salvat."
        ) from exc

    return ContentReportAttachment(
        id=uuid.uuid4(),
        report_id=report.id,
        original_filename=safe_name,
        content_type=(upload.content_type or None)[:160]
        if upload.content_type
        else None,
        size_bytes=size_bytes,
        storage_path=str(storage_path),
    )


async def _store_content_report_attachments(
    *,
    report: ContentReport,
    reference: str,
    uploads: list[StarletteUploadFile],
    settings: Settings,
) -> list[ContentReportAttachment]:
    if not uploads:
        return []

    if len(uploads) > settings.content_report_attachment_max_files:
        raise ContentReportAttachmentError(
            "Poți atașa cel mult "
            f"{settings.content_report_attachment_max_files} documente."
        )

    stored_paths: list[Path] = []
    attachments: list[ContentReportAttachment] = []
    try:
        for upload_index, upload in enumerate(uploads):
            attachments.append(
                await _store_content_report_attachment(
                    report=report,
                    reference=reference,
                    upload=upload,
                    upload_index=upload_index,
                    settings=settings,
                    stored_paths=stored_paths,
                )
            )
    except ContentReportAttachmentError:
        _cleanup_attachment_paths(stored_paths)
        raise

    return attachments


async def _send_contact_email(
    *,
    session: DbSession,
    settings: Settings,
    reference: str,
    email_type: str,
    message: EmailMessage,
    ip_address: str | None,
    user_agent: str | None,
) -> bool:
    try:
        await EmailService(settings).send(message)
    except EmailDeliveryError as exc:
        session.add(
            ComplianceEvent(
                event_type="contact_email_failed",
                payload=_email_event_payload(
                    reference=reference,
                    email_type=email_type,
                    recipient=message.to,
                    error=str(exc),
                ),
                ip_address=ip_address,
                user_agent=user_agent,
            )
        )
        await session.commit()
        return False

    session.add(
        ComplianceEvent(
            event_type="contact_email_sent",
            payload=_email_event_payload(
                reference=reference,
                email_type=email_type,
                recipient=message.to,
            ),
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    await session.commit()
    return True


async def _send_content_report_email(
    *,
    session: DbSession,
    settings: Settings,
    reference: str,
    email_type: str,
    message: EmailMessage,
    ip_address: str | None,
    user_agent: str | None,
) -> bool:
    try:
        await EmailService(settings).send(message)
    except EmailDeliveryError as exc:
        session.add(
            ComplianceEvent(
                event_type="content_report_email_failed",
                payload=_email_event_payload(
                    reference=reference,
                    email_type=email_type,
                    recipient=message.to,
                    error=str(exc),
                ),
                ip_address=ip_address,
                user_agent=user_agent,
            )
        )
        await session.commit()
        return False

    session.add(
        ComplianceEvent(
            event_type="content_report_email_sent",
            payload=_email_event_payload(
                reference=reference,
                email_type=email_type,
                recipient=message.to,
            ),
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    await session.commit()
    return True


async def _send_withdrawal_email(
    *,
    session: DbSession,
    settings: Settings,
    reference: str,
    email_type: str,
    message: EmailMessage,
    ip_address: str | None,
    user_agent: str | None,
) -> bool:
    try:
        await EmailService(settings).send(message)
    except EmailDeliveryError as exc:
        session.add(
            ComplianceEvent(
                event_type="withdrawal_email_failed",
                payload=_email_event_payload(
                    reference=reference,
                    email_type=email_type,
                    recipient=message.to,
                    error=str(exc),
                ),
                ip_address=ip_address,
                user_agent=user_agent,
            )
        )
        await session.commit()
        return False

    session.add(
        ComplianceEvent(
            event_type="withdrawal_email_sent",
            payload=_email_event_payload(
                reference=reference,
                email_type=email_type,
                recipient=message.to,
            ),
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    await session.commit()
    return True


async def _send_contact_emails(
    *,
    payload: ContactRequest,
    reference: str,
    session: DbSession,
    settings: Settings,
    ip_address: str | None,
    user_agent: str | None,
) -> bool:
    category_label = CONTACT_CATEGORY_LABELS.get(payload.category, payload.category)
    logo_html = email_logo_html(settings.email_logo_url, app_name="Reviss")
    html, text = contact_confirmation_email(
        app_url=settings.public_app_url,
        reference=reference,
        category_label=category_label,
        subject=payload.subject,
        logo_html=logo_html,
    )
    confirmation_sent = await _send_contact_email(
        session=session,
        settings=settings,
        reference=reference,
        email_type="confirmation",
        message=EmailMessage(
            to=str(payload.email),
            subject=f"Am primit mesajul tău Reviss ({reference})",
            html=html,
            text=text,
        ),
        ip_address=ip_address,
        user_agent=user_agent,
    )

    notification_recipient = await _contact_notification_recipient(session)
    if notification_recipient is None:
        session.add(
            ComplianceEvent(
                event_type="contact_email_skipped",
                payload=_email_event_payload(
                    reference=reference,
                    email_type="notification",
                    recipient=None,
                    error="company_data.email nu este configurat.",
                ),
                ip_address=ip_address,
                user_agent=user_agent,
            )
        )
        await session.commit()
        return confirmation_sent

    html, text = contact_notification_email(
        app_url=settings.public_app_url,
        reference=reference,
        sender_name=payload.name,
        sender_email=str(payload.email),
        category_label=category_label,
        subject=payload.subject,
        message=payload.message,
        logo_html=logo_html,
    )
    await _send_contact_email(
        session=session,
        settings=settings,
        reference=reference,
        email_type="notification",
        message=EmailMessage(
            to=notification_recipient,
            subject=_email_subject("Mesaj nou Reviss", payload.subject),
            html=html,
            text=text,
            reply_to=str(payload.email),
        ),
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return confirmation_sent


async def _send_withdrawal_emails(
    *,
    payload: WithdrawalRequestPayload,
    reference: str,
    session: DbSession,
    settings: Settings,
    ip_address: str | None,
    user_agent: str | None,
) -> bool:
    logo_html = email_logo_html(settings.email_logo_url, app_name="Reviss")
    html, text = withdrawal_confirmation_email(
        app_url=settings.public_app_url,
        reference=reference,
        subscription_or_order=payload.subscription_or_order,
        order_number=payload.order_number,
        logo_html=logo_html,
    )
    confirmation_sent = await _send_withdrawal_email(
        session=session,
        settings=settings,
        reference=reference,
        email_type="confirmation",
        message=EmailMessage(
            to=str(payload.email),
            subject=f"Am primit retragerea ta Reviss ({reference})",
            html=html,
            text=text,
        ),
        ip_address=ip_address,
        user_agent=user_agent,
    )

    notification_recipient = await _contact_notification_recipient(session)
    if notification_recipient is None:
        session.add(
            ComplianceEvent(
                event_type="withdrawal_email_skipped",
                payload=_email_event_payload(
                    reference=reference,
                    email_type="notification",
                    recipient=None,
                    error="company_data.email nu este configurat.",
                ),
                ip_address=ip_address,
                user_agent=user_agent,
            )
        )
        await session.commit()
        return confirmation_sent

    html, text = withdrawal_notification_email(
        app_url=settings.public_app_url,
        reference=reference,
        full_name=payload.full_name,
        sender_email=str(payload.email),
        subscription_or_order=payload.subscription_or_order,
        order_number=payload.order_number,
        reason=payload.reason,
        logo_html=logo_html,
    )
    await _send_withdrawal_email(
        session=session,
        settings=settings,
        reference=reference,
        email_type="notification",
        message=EmailMessage(
            to=notification_recipient,
            subject=_email_subject("Retragere contract Reviss", reference),
            html=html,
            text=text,
            reply_to=str(payload.email),
        ),
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return confirmation_sent


async def _send_content_report_emails(
    *,
    payload: ContentReportRequestPayload,
    reference: str,
    attachments: list[ContentReportAttachment],
    session: DbSession,
    settings: Settings,
    ip_address: str | None,
    user_agent: str | None,
) -> bool:
    report_type_label = CONTENT_REPORT_TYPE_LABELS.get(
        payload.report_type,
        payload.report_type,
    )
    logo_html = email_logo_html(settings.email_logo_url, app_name="Reviss")
    html, text = content_report_confirmation_email(
        app_url=settings.public_app_url,
        reference=reference,
        report_type_label=report_type_label,
        content_reference=payload.content_reference,
        attachment_names=[
            attachment.original_filename for attachment in attachments
        ],
        logo_html=logo_html,
    )
    confirmation_sent = await _send_content_report_email(
        session=session,
        settings=settings,
        reference=reference,
        email_type="confirmation",
        message=EmailMessage(
            to=str(payload.email),
            subject=f"Am primit raportarea ta Reviss ({reference})",
            html=html,
            text=text,
        ),
        ip_address=ip_address,
        user_agent=user_agent,
    )

    notification_recipient = await _content_report_notification_recipient(
        session,
        payload.report_type,
    )
    if notification_recipient is None:
        session.add(
            ComplianceEvent(
                event_type="content_report_email_skipped",
                payload=_email_event_payload(
                    reference=reference,
                    email_type="notification",
                    recipient=None,
                    error="company_data.email nu este configurat.",
                ),
                ip_address=ip_address,
                user_agent=user_agent,
            )
        )
        await session.commit()
        return confirmation_sent

    html, text = content_report_notification_email(
        app_url=settings.public_app_url,
        reference=reference,
        sender_name=payload.name,
        sender_email=str(payload.email),
        report_type_label=report_type_label,
        content_reference=payload.content_reference,
        description=payload.description,
        rights_evidence=payload.rights_evidence,
        attachment_names=[
            attachment.original_filename for attachment in attachments
        ],
        logo_html=logo_html,
    )
    await _send_content_report_email(
        session=session,
        settings=settings,
        reference=reference,
        email_type="notification",
        message=EmailMessage(
            to=notification_recipient,
            subject=_email_subject(
                "Raportare conținut Reviss",
                payload.content_reference,
            ),
            html=html,
            text=text,
            reply_to=str(payload.email),
        ),
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return confirmation_sent


def _rate_limit_policy(
    request: Request,
    settings: Settings,
) -> tuple[int, int]:
    if request.url.path == "/api/compliance/contact":
        return (
            settings.contact_rate_limit_window_seconds,
            settings.contact_rate_limit_max_requests,
        )
    if request.url.path == "/api/compliance/withdrawal":
        return (
            settings.contact_rate_limit_window_seconds,
            settings.contact_rate_limit_max_requests,
        )
    if request.url.path == "/api/compliance/content-report":
        return (
            settings.content_report_rate_limit_window_seconds,
            settings.content_report_rate_limit_max_requests,
        )

    return RATE_LIMIT_WINDOW_SECONDS, RATE_LIMIT_MAX_REQUESTS


def _post_recaptcha_verification(
    *,
    verify_url: str,
    secret: str,
    token: str,
    remote_ip: str | None,
) -> dict[str, object]:
    form_data = {
        "secret": secret,
        "response": token,
    }
    if remote_ip:
        form_data["remoteip"] = remote_ip

    request = urllib.request.Request(
        verify_url,
        data=urllib.parse.urlencode(form_data).encode("utf-8"),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Reviss/1.0",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=RECAPTCHA_TIMEOUT_SECONDS) as response:
        charset = response.headers.get_content_charset("utf-8")
        return json.loads(response.read().decode(charset))


async def verify_contact_recaptcha(
    token: str,
    request: Request,
    settings: Settings,
) -> None:
    if settings.recaptcha_secret_key is None:
        if settings.environment == "production":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Protecția anti-spam nu este configurată.",
            )
        return

    normalized_token = token.strip()
    if not normalized_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmă verificarea anti-spam înainte de trimitere.",
        )

    try:
        verification = await asyncio.to_thread(
            _post_recaptcha_verification,
            verify_url=settings.recaptcha_verify_url,
            secret=settings.recaptcha_secret_key.get_secret_value(),
            token=normalized_token,
            remote_ip=_client_ip(request),
        )
    except (
        TimeoutError,
        OSError,
        json.JSONDecodeError,
        urllib.error.URLError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verificarea anti-spam nu este disponibilă momentan.",
        ) from exc

    if verification.get("success") is not True:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Verificarea anti-spam a eșuat. Reîncarcă pagina și încearcă "
                "din nou."
            ),
        )


async def protect_form_request(
    request: Request,
    settings: AppSettings,
) -> None:
    origin = request.headers.get("origin")
    referer = request.headers.get("referer")
    allowed_origins = set(settings.allowed_origins)

    if origin and origin not in allowed_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Originea solicitării nu este permisă.",
        )

    if not origin and referer and not any(
        referer.startswith(allowed_origin) for allowed_origin in allowed_origins
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Referer-ul solicitării nu este permis.",
        )

    form_intent = request.headers.get("x-reviss-form-intent")
    if not form_intent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solicitarea nu a putut fi verificată.",
        )

    ip_address = _client_ip(request) or "unknown"
    rate_limit_window_seconds, rate_limit_max_requests = _rate_limit_policy(
        request,
        settings,
    )
    await consume_rate_limit(
        bucket_key=f"compliance:{ip_address}:{request.url.path}",
        max_requests=rate_limit_max_requests,
        window_seconds=rate_limit_window_seconds,
        error_message="Prea multe solicitări. Încearcă din nou mai târziu.",
    )


FormProtection = Depends(protect_form_request)


@router.post(
    "/cookie-consent",
    response_model=ComplianceResponse,
    dependencies=[FormProtection],
)
async def log_cookie_consent(
    payload: CookieConsentRequest,
    request: Request,
    session: DbSession,
) -> ComplianceResponse:
    user_agent, ip_address = _client_context(request)
    session.add(
        ComplianceEvent(
            event_type="cookie_consent_changed",
            payload=_payload(payload),
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    await session.commit()
    return ComplianceResponse(message="Preferințele cookie au fost salvate.")


@router.post(
    "/contact",
    response_model=ComplianceResponse,
    dependencies=[FormProtection],
)
async def create_contact_message(
    payload: ContactRequest,
    request: Request,
    session: DbSession,
    settings: AppSettings,
) -> ComplianceResponse:
    await verify_contact_recaptcha(payload.recaptcha_token, request, settings)
    user_agent, ip_address = _client_context(request)
    contact_message = ContactMessage(
        name=payload.name,
        email=str(payload.email),
        category=payload.category,
        subject=payload.subject,
        message=payload.message,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    session.add(contact_message)
    await session.flush()
    reference = _contact_reference(contact_message.id)
    session.add(
        ComplianceEvent(
            event_type="contact_message_created",
            payload={
                **_payload(payload),
                "reference": reference,
                "contact_message_id": str(contact_message.id),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    await session.commit()
    confirmation_sent = await _send_contact_emails(
        payload=payload,
        reference=reference,
        session=session,
        settings=settings,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    message = "Mesajul a fost înregistrat."
    if confirmation_sent:
        message += " Ți-am trimis confirmarea pe email."
    else:
        message += " Confirmarea pe email nu a putut fi trimisă momentan."
    return ComplianceResponse(message=message, registration_number=reference)


@router.post(
    "/withdrawal",
    response_model=ComplianceResponse,
    dependencies=[FormProtection],
)
async def create_withdrawal_request(
    payload: WithdrawalRequestPayload,
    request: Request,
    session: DbSession,
    settings: AppSettings,
) -> ComplianceResponse:
    await verify_contact_recaptcha(payload.recaptcha_token, request, settings)
    user_agent, ip_address = _client_context(request)
    registration_number = _registration_number("RET")
    withdrawal_request = WithdrawalRequest(
        registration_number=registration_number,
        full_name=payload.full_name,
        email=str(payload.email),
        subscription_or_order=payload.subscription_or_order,
        order_number=payload.order_number,
        reason=payload.reason,
        confirmation=payload.confirmation,
        email_confirmation_status="queued",
        ip_address=ip_address,
        user_agent=user_agent,
    )
    session.add(withdrawal_request)
    session.add(
        ComplianceEvent(
            event_type="withdrawal_request_created",
            payload={
                **_payload(payload),
                "registration_number": registration_number,
                "email_confirmation_status": "queued",
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    await session.commit()
    confirmation_sent = await _send_withdrawal_emails(
        payload=payload,
        reference=registration_number,
        session=session,
        settings=settings,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    withdrawal_request.email_confirmation_status = (
        "sent" if confirmation_sent else "failed"
    )
    session.add(
        ComplianceEvent(
            event_type="withdrawal_email_status_updated",
            payload={
                "registration_number": registration_number,
                "email_confirmation_status": (
                    withdrawal_request.email_confirmation_status
                ),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    await session.commit()
    message = "Solicitarea de retragere a fost înregistrată."
    if confirmation_sent:
        message += " Ți-am trimis confirmarea pe email."
    else:
        message += " Confirmarea pe email nu a putut fi trimisă momentan."
    return ComplianceResponse(
        message=message,
        registration_number=registration_number,
    )


@router.post(
    "/content-report",
    response_model=ComplianceResponse,
    dependencies=[FormProtection],
)
async def create_content_report(
    request: Request,
    session: DbSession,
    settings: AppSettings,
) -> ComplianceResponse:
    payload, uploads = await _parse_content_report_payload(request)
    await verify_contact_recaptcha(payload.recaptcha_token, request, settings)
    user_agent, ip_address = _client_context(request)
    registration_number = _registration_number("RAP")
    content_report = ContentReport(
        registration_number=registration_number,
        name=payload.name,
        email=str(payload.email),
        report_type=payload.report_type,
        content_reference=payload.content_reference,
        description=payload.description,
        rights_evidence=payload.rights_evidence,
        declaration=payload.declaration,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    session.add(content_report)
    await session.flush()
    try:
        attachments = await _store_content_report_attachments(
            report=content_report,
            reference=registration_number,
            uploads=uploads,
            settings=settings,
        )
    except ContentReportAttachmentError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    for attachment in attachments:
        session.add(attachment)
    session.add(
        ComplianceEvent(
            event_type="content_report_created",
            payload={
                **_payload(payload),
                "registration_number": registration_number,
                "attachments": _attachment_event_payload(attachments),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    try:
        await session.commit()
    except SQLAlchemyError as exc:
        await session.rollback()
        _cleanup_attachment_paths(
            [Path(attachment.storage_path) for attachment in attachments]
        )
        logger.exception(
            "Content report persistence failed for %s",
            registration_number,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Sesizarea nu a putut fi salvată momentan. "
                "Baza de date trebuie actualizată pentru documentele atașate."
            ),
        ) from exc
    confirmation_sent = await _send_content_report_emails(
        payload=payload,
        reference=registration_number,
        attachments=attachments,
        session=session,
        settings=settings,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    message = "Sesizarea a fost înregistrată."
    if confirmation_sent:
        message += " Ți-am trimis confirmarea pe email."
    else:
        message += " Confirmarea pe email nu a putut fi trimisă momentan."
    return ComplianceResponse(
        message=message,
        registration_number=registration_number,
    )


@router.post(
    "/subscription-cancel",
    response_model=ComplianceResponse,
    dependencies=[FormProtection],
)
async def cancel_subscription_renewal(
    payload: SubscriptionCancellationRequest,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
) -> ComplianceResponse:
    user_agent, ip_address = _client_context(request)
    active_until = "24 iulie 2026"
    session.add(
        SubscriptionCancellation(
            user_id=current_user.id,
            plan_name=payload.plan_name,
            renewal_date=payload.renewal_date,
            price=payload.price,
            active_until=active_until,
        )
    )
    session.add(
        ComplianceEvent(
            user_id=current_user.id,
            event_type="subscription_renewal_cancelled",
            payload={
                **_payload(payload),
                "active_until": active_until,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
    )
    await session.commit()
    return ComplianceResponse(
        message="Reînnoirea automată a abonamentului a fost oprită.",
        active_until=active_until,
    )

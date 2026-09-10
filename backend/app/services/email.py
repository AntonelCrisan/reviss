# ruff: noqa: E501
from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from html import escape
from pathlib import Path

from anyio import to_thread

from app.core.config import Settings
from app.core.i18n import plural_key, t

RESEND_EMAILS_URL = "https://api.resend.com/emails"
PROJECT_DIR = Path(__file__).resolve().parents[3]
DEFAULT_LOGO_PATH = (
    PROJECT_DIR
    / "frontend"
    / "public"
    / "assets"
    / "logos"
    / "Reviss_logo_dark.svg"
)


class EmailDeliveryError(Exception):
    pass


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    html: str
    text: str
    reply_to: str | None = None


class EmailService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def send(self, message: EmailMessage) -> None:
        await to_thread.run_sync(self._send_sync, message)

    def _send_sync(self, message: EmailMessage) -> None:
        if self._settings.resend_api_key is None:
            raise EmailDeliveryError("Serviciul de email nu este configurat.")

        payload = {
            "from": self._settings.resend_from_email,
            "to": [message.to],
            "subject": message.subject,
            "html": message.html,
            "text": message.text,
        }
        if message.reply_to:
            payload["reply_to"] = message.reply_to
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            RESEND_EMAILS_URL,
            data=body,
            method="POST",
            headers={
                "Authorization": (
                    f"Bearer {self._settings.resend_api_key.get_secret_value()}"
                ),
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "Reviss/1.0",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.status >= 400:
                    raise EmailDeliveryError(
                        f"Serviciul de email a întors statusul {response.status}."
                    )
        except urllib.error.HTTPError as exc:
            response_body = exc.read().decode("utf-8", errors="replace")
            raise EmailDeliveryError(
                f"Serviciul de email a refuzat trimiterea: {response_body}"
            ) from exc
        except urllib.error.URLError as exc:
            raise EmailDeliveryError(
                "Serviciul de email nu a putut fi contactat."
            ) from exc


def _fallback_logo_html(app_name: str) -> str:
    return (
        '<span style="display: inline-block; color: #2d2823; '
        "font-family: Georgia, 'Times New Roman', serif; font-size: 28px; "
        f'font-weight: 700; line-height: 36px;">{escape(app_name)}</span>'
    )


@lru_cache(maxsize=8)
def default_email_logo_html(app_name: str = "Reviss") -> str:
    try:
        logo_svg = DEFAULT_LOGO_PATH.read_text(encoding="utf-8")
    except OSError:
        return _fallback_logo_html(app_name)

    logo_svg = logo_svg.replace('<?xml version="1.0" encoding="UTF-8"?>', "").strip()
    aria_label = escape(app_name, quote=True)
    if "<svg " in logo_svg:
        logo_svg = logo_svg.replace(
            "<svg ",
            (
                f'<svg role="img" aria-label="{aria_label}" width="158" '
                'height="36" style="display:block;width:158px;'
                'max-width:158px;height:auto;" '
            ),
            1,
        )
    return logo_svg


def email_logo_html(logo_url: str | None, app_name: str = "Reviss") -> str:
    if logo_url:
        safe_logo_url = escape(logo_url, quote=True)
        safe_app_name = escape(app_name, quote=True)
        return (
            f'<img src="{safe_logo_url}" width="158" height="36" '
            f'alt="{safe_app_name}" style="display:block;width:158px;'
            'max-width:158px;height:auto;border:0;outline:none;'
            'text-decoration:none;">'
        )
    return default_email_logo_html(app_name)


def _detail_row_html(detail: str | tuple[str, str | None]) -> str:
    text, href = detail if isinstance(detail, tuple) else (detail, None)
    label: str | None = None
    value = text
    if ": " in text:
        candidate_label, candidate_value = text.split(": ", 1)
        if len(candidate_label) <= 40 and candidate_value.strip():
            label = candidate_label
            value = candidate_value
    safe_value = escape(value)
    if href:
        safe_href = escape(href, quote=True)
        safe_value = (
            f'<a href="{safe_href}" style="color: #1c1a17; font-weight: 700; text-decoration: underline;">'
            f"{safe_value}</a>"
        )
    label_html = (
        f'<span style="display: block; margin-bottom: 3px; color: #6e6b65; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;">{escape(label)}</span>'
        if label
        else ""
    )
    return f"""
        <tr>
          <td style="padding: 11px 0; border-bottom: 1px solid #e8e3d9; color: #33302b; font-size: 14px; line-height: 1.6;">
            {label_html}{safe_value}
          </td>
        </tr>
        """


def _email_shell(
    *,
    app_name: str,
    eyebrow: str,
    title: str,
    intro: str,
    logo_html: str,
    cta_label: str,
    action_url: str,
    note_title: str | None = None,
    note: str | None = None,
    details: list[str] | list[tuple[str, str | None]] | None = None,
    details_title: str | None = None,
    footer_note: str | None = None,
    preheader: str | None = None,
    language: str = "ro",
) -> str:
    safe_app_name = escape(app_name)
    safe_action_url = escape(action_url, quote=True)
    detail_items = "".join(_detail_row_html(detail) for detail in details or [])

    details_block = ""
    if detail_items:
        details_heading = (
            f"""
                    <p style="margin: 0 0 4px; color: #6e6b65; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;">
                      {escape(details_title)}
                    </p>
            """
            if details_title
            else ""
        )
        details_block = f"""
                <tr>
                  <td style="padding: 30px 0 0;">
                    {details_heading}
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #e8e3d9;">
                      {detail_items}
                    </table>
                  </td>
                </tr>
        """

    note_block = ""
    if note:
        note_heading = (
            f"""
                          <p style="margin: 0 0 6px; color: #1c1a17; font-size: 13px; font-weight: 700;">
                            {escape(note_title)}
                          </p>
            """
            if note_title
            else ""
        )
        note_block = f"""
                <tr>
                  <td style="padding: 30px 0 0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="border-left: 3px solid #d5cbb8; padding: 2px 0 2px 14px;">
                          {note_heading}
                          <p style="margin: 0; color: #4d4842; font-size: 13px; line-height: 1.65;">
                            {escape(note)}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
        """

    footer_text = footer_note or t(
        "email.shell.footer_default", language, app_name=app_name
    )
    link_fallback = t("email.shell.link_fallback", language)

    return f"""
    <!doctype html>
    <html lang="{language}">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="light">
        <title>{escape(title)}</title>
      </head>
      <body style="margin: 0; padding: 0; width: 100%; background: #fbf9f5; color: #1c1a17; font-family: Arial, Helvetica, sans-serif;">
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">
          {escape(preheader or intro)}
        </div>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width: 100%; background: #fbf9f5;">
          <tr>
            <td align="center" style="padding: 40px 24px 48px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width: 100%; max-width: 640px;">
                <tr>
                  <td style="padding: 0 0 22px; border-bottom: 1px solid #e8e3d9;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="height: 36px; vertical-align: middle;">
                          {logo_html}
                        </td>
                        <td align="right" style="vertical-align: middle; color: #6e6b65; font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;">
                          {escape(eyebrow)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 34px 0 0;">
                    <h1 style="margin: 0; color: #1c1a17; font-family: Georgia, 'Times New Roman', serif; font-size: 30px; line-height: 1.18; letter-spacing: -0.02em;">
                      {escape(title)}
                    </h1>
                    <p style="margin: 16px 0 0; color: #4d4842; font-size: 16px; line-height: 1.7;">
                      {escape(intro)}
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 26px 0 0;">
                    <a href="{safe_action_url}" style="display: inline-block; border-radius: 6px; background: #1c1a17; color: #fbf9f5; font-size: 14px; font-weight: 700; line-height: 1; padding: 15px 22px; text-decoration: none;">
                      {escape(cta_label)}
                    </a>
                    <p style="margin: 14px 0 0; word-break: break-all; color: #6e6b65; font-size: 12px; line-height: 1.6;">
                      {escape(link_fallback)}
                      <a href="{safe_action_url}" style="color: #6e6b65; text-decoration: underline;">{safe_action_url}</a>
                    </p>
                  </td>
                </tr>
{details_block}
{note_block}
                <tr>
                  <td style="padding: 34px 0 0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid #e8e3d9;">
                      <tr>
                        <td style="padding: 20px 0 0;">
                          <p style="margin: 0; color: #6e6b65; font-size: 12px; line-height: 1.7;">
                            {escape(footer_text)}
                          </p>
                          <p style="margin: 6px 0 0; color: #8d887f; font-size: 12px; line-height: 1.7;">
                            {safe_app_name}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
    """


def _strings(prefix: str, language: str):
    """``s("key", **params)`` -> the ``prefix.key`` string in ``language``."""

    def lookup(key: str, **params: object) -> str:
        return t(f"{prefix}.{key}", language, **params)

    return lookup


def verification_email(
    *,
    verification_url: str,
    logo_html: str,
    app_name: str = "Reviss",
    language: str = "ro",
) -> tuple[str, str]:
    s = _strings("email.verification", language)
    text = s("text", app_name=app_name, url=verification_url)
    html = _email_shell(
        app_name=app_name,
        eyebrow=s("eyebrow"),
        title=s("title"),
        intro=s("intro"),
        preheader=s("preheader"),
        logo_html=logo_html,
        cta_label=s("cta"),
        action_url=verification_url,
        details_title=s("details_title"),
        details=[
            s("detail_validity"),
            s("detail_after"),
            s("detail_not_you"),
        ],
        footer_note=s("footer", app_name=app_name),
        language=language,
    )
    return html, text


def email_change_confirmation_email(
    *,
    confirmation_url: str,
    logo_html: str,
    new_email: str,
    app_name: str = "Reviss",
    language: str = "ro",
) -> tuple[str, str]:
    s = _strings("email.email_change", language)
    text = s("text", app_name=app_name, new_email=new_email, url=confirmation_url)
    html = _email_shell(
        app_name=app_name,
        eyebrow=s("eyebrow"),
        title=s("title"),
        intro=s("intro", new_email=new_email),
        preheader=s("preheader", new_email=new_email),
        logo_html=logo_html,
        cta_label=s("cta"),
        action_url=confirmation_url,
        details_title=s("details_title"),
        details=[
            s("detail_new", new_email=new_email),
            s("detail_until"),
            s("detail_after"),
            s("detail_validity"),
        ],
        note_title=s("note_title"),
        note=s("note"),
        language=language,
    )
    return html, text


def notification_digest_email(
    *,
    items: list[tuple[str, str, str | None]],
    app_url: str,
    logo_html: str,
    app_name: str = "Reviss",
    language: str = "ro",
) -> tuple[str, str]:
    """items: (title, body, project_url) tuples. project_url links straight to
    the relevant project when the notification is about one (None otherwise).
    """
    s = _strings("email.digest", language)
    is_digest = len(items) > 1
    details: list[tuple[str, str | None]] = []
    details_title: str | None = None

    if is_digest:
        title = s("title_many", count=len(items))
        intro = s("intro_many")
        details = [
            (f"{item_title}: {item_body}", href)
            for item_title, item_body, href in items
        ]
        details_title = s("details_title")
        text = (
            f"{title}\n\n{intro}\n\n"
            + "\n".join(
                f"- {item_title}: {item_body}" + (f" ({href})" if href else "")
                for item_title, item_body, href in items
            )
            + "\n\n"
            + s("open_app", app_name=app_name, url=app_url)
        )
        preheader = s("preheader_many", count=len(items))
    else:
        item_title, item_body, item_url = items[0]
        title = item_title
        intro = item_body
        text = (
            f"{item_title}\n\n{item_body}\n\n"
            + s("open_in_app", app_name=app_name, url=item_url or app_url)
        )
        preheader = item_body

    single_project_url = items[0][2] if not is_digest else None
    html = _email_shell(
        app_name=app_name,
        eyebrow=s("eyebrow_many") if is_digest else s("eyebrow_single"),
        title=title,
        intro=intro,
        preheader=preheader,
        logo_html=logo_html,
        cta_label=(
            s("cta_project") if single_project_url else s("cta_app", app_name=app_name)
        ),
        action_url=single_project_url or app_url,
        details_title=details_title,
        details=details,
        note_title=s("note_title"),
        note=s("note"),
        footer_note=s("footer", app_name=app_name),
        language=language,
    )
    return html, text


def password_reset_email(
    *,
    reset_url: str,
    logo_html: str,
    app_name: str = "Reviss",
    language: str = "ro",
) -> tuple[str, str]:
    s = _strings("email.password_reset", language)
    text = s("text", app_name=app_name, url=reset_url)
    html = _email_shell(
        app_name=app_name,
        eyebrow=s("eyebrow"),
        title=s("title"),
        intro=s("intro"),
        preheader=s("preheader"),
        logo_html=logo_html,
        cta_label=s("cta"),
        action_url=reset_url,
        details_title=s("details_title"),
        details=[
            s("detail_until"),
            s("detail_after"),
            s("detail_validity"),
        ],
        note_title=s("note_title"),
        note=s("note"),
        footer_note=s("footer", app_name=app_name),
        language=language,
    )
    return html, text


def contact_confirmation_email(
    *,
    app_url: str,
    reference: str,
    category_label: str,
    subject: str,
    logo_html: str,
    app_name: str = "Reviss",
    language: str = "ro",
) -> tuple[str, str]:
    s = _strings("email.contact_confirmation", language)
    text = s(
        "text",
        app_name=app_name,
        reference=reference,
        category=category_label,
        subject=subject,
        url=app_url,
    )
    html = _email_shell(
        app_name=app_name,
        eyebrow=s("eyebrow"),
        title=s("title"),
        intro=s("intro"),
        preheader=s("preheader", reference=reference),
        logo_html=logo_html,
        cta_label=t("email.digest.cta_app", language, app_name=app_name),
        action_url=app_url,
        details_title=s("details_title"),
        details=[
            f"{s('label_reference')}: {reference}",
            f"{s('label_category')}: {category_label}",
            f"{s('label_subject')}: {subject}",
        ],
        note_title=s("note_title"),
        note=s("note"),
        footer_note=s("footer", app_name=app_name),
        language=language,
    )
    return html, text


def contact_notification_email(
    *,
    app_url: str,
    reference: str,
    sender_name: str,
    sender_email: str,
    category_label: str,
    subject: str,
    message: str,
    logo_html: str,
    app_name: str = "Reviss",
) -> tuple[str, str]:
    trimmed_message = message.strip()
    preview_message = (
        f"{trimmed_message[:700]}..."
        if len(trimmed_message) > 700
        else trimmed_message
    )
    text = (
        f"Mesaj nou din formularul de contact {app_name}.\n\n"
        f"Referință: {reference}\n"
        f"Nume: {sender_name}\n"
        f"Email: {sender_email}\n"
        f"Categorie: {category_label}\n"
        f"Subiect: {subject}\n\n"
        f"Mesaj:\n{trimmed_message}\n\n"
        f"Deschide {app_name}: {app_url}"
    )
    html = _email_shell(
        app_name=app_name,
        eyebrow="Contact nou",
        title="Mesaj nou din formularul de contact",
        intro=(
            f"{sender_name} a trimis o solicitare în categoria "
            f"„{category_label}”. Poți răspunde direct la {sender_email}."
        ),
        preheader=f"{sender_name}: {subject}",
        logo_html=logo_html,
        cta_label=f"Deschide {app_name}",
        action_url=app_url,
        details_title="Detaliile expeditorului",
        details=[
            f"Referință: {reference}",
            f"Nume: {sender_name}",
            f"Email: {sender_email}",
            f"Categorie: {category_label}",
            f"Subiect: {subject}",
        ],
        note_title="Mesajul primit",
        note=preview_message,
        footer_note=(
            "Notificare internă. Mesajul complet este salvat și în baza de date "
            f"{app_name}."
        ),
    )
    return html, text


def content_report_confirmation_email(
    *,
    app_url: str,
    reference: str,
    report_type_label: str,
    content_reference: str,
    attachment_names: list[str] | None,
    logo_html: str,
    app_name: str = "Reviss",
    language: str = "ro",
) -> tuple[str, str]:
    s = _strings("email.content_report_confirmation", language)
    attachment_count = len(attachment_names or [])
    if attachment_count == 0:
        attachment_label = s("attachments_none")
    else:
        attachment_label = t(
            plural_key("email.content_report_confirmation.attachments", attachment_count),
            language,
            count=attachment_count,
        )
    text = s(
        "text",
        app_name=app_name,
        reference=reference,
        report_type=report_type_label,
        content_reference=content_reference,
        attachments=attachment_label,
        url=app_url,
    )
    html = _email_shell(
        app_name=app_name,
        eyebrow=s("eyebrow"),
        title=s("title"),
        intro=s("intro"),
        preheader=s("preheader", reference=reference),
        logo_html=logo_html,
        cta_label=t("email.digest.cta_app", language, app_name=app_name),
        action_url=app_url,
        details_title=s("details_title"),
        details=[
            f"{s('label_reference')}: {reference}",
            f"{s('label_type')}: {report_type_label}",
            f"{s('label_content')}: {content_reference}",
            f"{s('label_attachments')}: {attachment_label}",
        ],
        note_title=s("note_title"),
        note=s("note"),
        footer_note=s("footer", app_name=app_name),
        language=language,
    )
    return html, text


def content_report_notification_email(
    *,
    app_url: str,
    reference: str,
    sender_name: str,
    sender_email: str,
    report_type_label: str,
    content_reference: str,
    description: str,
    rights_evidence: str | None,
    attachment_names: list[str] | None,
    logo_html: str,
    app_name: str = "Reviss",
) -> tuple[str, str]:
    trimmed_description = description.strip()
    preview_description = (
        f"{trimmed_description[:700]}..."
        if len(trimmed_description) > 700
        else trimmed_description
    )
    admin_url = f"{app_url.rstrip('/')}/admin/settings/raportari-continut"
    evidence_text = rights_evidence.strip() if rights_evidence else "-"
    attachment_list = ", ".join(attachment_names or []) or "-"
    text = (
        f"Raportare nouă de conținut în {app_name}.\n\n"
        f"Număr de înregistrare: {reference}\n"
        f"Nume: {sender_name}\n"
        f"Email: {sender_email}\n"
        f"Tip raportare: {report_type_label}\n"
        f"Conținut raportat: {content_reference}\n\n"
        f"Descriere:\n{trimmed_description}\n\n"
        f"Dovezi / context:\n{evidence_text}\n\n"
        f"Documente atașate:\n{attachment_list}\n\n"
        f"Deschide raportările: {admin_url}"
    )
    html = _email_shell(
        app_name=app_name,
        eyebrow="Raportare conținut",
        title="Sesizare nouă de conținut",
        intro=(
            f"{sender_name} a raportat „{content_reference}” prin formularul "
            f"public, la categoria „{report_type_label}”. Sesizarea completă "
            "este în zona de administrare."
        ),
        preheader=f"{report_type_label}: {content_reference}",
        logo_html=logo_html,
        cta_label="Deschide raportările",
        action_url=admin_url,
        details_title="Detaliile sesizării",
        details=[
            f"Număr de înregistrare: {reference}",
            f"Nume: {sender_name}",
            f"Email: {sender_email}",
            f"Tip raportare: {report_type_label}",
            f"Conținut raportat: {content_reference}",
            f"Dovezi / context: {evidence_text}",
            f"Documente atașate: {attachment_list}",
        ],
        note_title="Descrierea trimisă",
        note=preview_description,
        footer_note=(
            "Notificare internă. Sesizarea completă este salvată în zona de "
            f"administrare {app_name}."
        ),
    )
    return html, text


def withdrawal_confirmation_email(
    *,
    app_url: str,
    reference: str,
    subscription_or_order: str,
    order_number: str | None,
    logo_html: str,
    app_name: str = "Reviss",
    language: str = "ro",
) -> tuple[str, str]:
    s = _strings("email.withdrawal_confirmation", language)
    order_label = order_number.strip() if order_number else "-"
    text = s(
        "text",
        app_name=app_name,
        reference=reference,
        subscription_or_order=subscription_or_order,
        order_number=order_label,
        url=app_url,
    )
    html = _email_shell(
        app_name=app_name,
        eyebrow=s("eyebrow"),
        title=s("title"),
        intro=s("intro"),
        preheader=s("preheader", reference=reference),
        logo_html=logo_html,
        cta_label=t("email.digest.cta_app", language, app_name=app_name),
        action_url=app_url,
        details_title=s("details_title"),
        details=[
            f"{s('label_reference')}: {reference}",
            f"{s('label_subscription')}: {subscription_or_order}",
            f"{s('label_order')}: {order_label}",
        ],
        note_title=s("note_title"),
        note=s("note"),
        footer_note=s("footer", app_name=app_name),
        language=language,
    )
    return html, text


def withdrawal_notification_email(
    *,
    app_url: str,
    reference: str,
    full_name: str,
    sender_email: str,
    subscription_or_order: str,
    order_number: str | None,
    reason: str | None,
    logo_html: str,
    app_name: str = "Reviss",
) -> tuple[str, str]:
    admin_url = f"{app_url.rstrip('/')}/admin/settings/retrageri-contract"
    order_label = order_number.strip() if order_number else "-"
    reason_text = reason.strip() if reason else "-"
    preview_reason = (
        f"{reason_text[:700]}..." if len(reason_text) > 700 else reason_text
    )
    text = (
        f"Solicitare nouă de retragere din contract în {app_name}.\n\n"
        f"Număr de înregistrare: {reference}\n"
        f"Nume: {full_name}\n"
        f"Email: {sender_email}\n"
        f"Abonament sau comandă: {subscription_or_order}\n"
        f"Număr comandă: {order_label}\n\n"
        f"Motiv:\n{reason_text}\n\n"
        f"Deschide retragerile: {admin_url}"
    )
    html = _email_shell(
        app_name=app_name,
        eyebrow="Retragere contract",
        title="Solicitare nouă de retragere",
        intro=(
            f"{full_name} a cerut retragerea din contract pentru "
            f"„{subscription_or_order}”. Solicitarea completă este în zona de "
            "administrare."
        ),
        preheader=f"{full_name}: {subscription_or_order}",
        logo_html=logo_html,
        cta_label="Deschide retragerile",
        action_url=admin_url,
        details_title="Detaliile solicitării",
        details=[
            f"Număr de înregistrare: {reference}",
            f"Nume: {full_name}",
            f"Email: {sender_email}",
            f"Abonament sau comandă: {subscription_or_order}",
            f"Număr comandă: {order_label}",
        ],
        note_title="Motivul invocat",
        note=preview_reason,
        footer_note=(
            "Notificare internă. Solicitarea completă este salvată în zona de "
            f"administrare {app_name}."
        ),
    )
    return html, text


def account_deleted_email(
    *,
    app_url: str,
    full_name: str,
    logo_html: str,
    app_name: str = "Reviss",
    language: str = "ro",
) -> tuple[str, str]:
    s = _strings("email.account_deleted", language)
    first_name = full_name.strip().split(" ", 1)[0] if full_name.strip() else ""
    greeting = (
        s("greeting_named", first_name=first_name) if first_name else s("greeting")
    )
    text = s("text", greeting=greeting, app_name=app_name, url=app_url)
    html = _email_shell(
        app_name=app_name,
        eyebrow=s("eyebrow"),
        title=s("title"),
        intro=s("intro", greeting=greeting, app_name=app_name),
        preheader=s("preheader"),
        logo_html=logo_html,
        cta_label=s("cta"),
        action_url=app_url,
        details_title=s("details_title"),
        details=[
            s("detail_access"),
            s("detail_materials"),
            s("detail_retained"),
        ],
        note_title=s("note_title"),
        note=s("note"),
        footer_note=s("footer", app_name=app_name),
        language=language,
    )
    return html, text


def invoice_paid_email(
    *,
    invoice_url: str,
    invoice_pdf_url: str | None,
    invoice_number: str | None,
    amount_label: str,
    paid_at_label: str | None,
    plan_name: str | None,
    logo_html: str,
    app_name: str = "Reviss",
    language: str = "ro",
) -> tuple[str, str]:
    s = _strings("email.invoice_paid", language)
    invoice_label = invoice_number or "-"
    plan_label = plan_name or s("plan_fallback", app_name=app_name)
    paid_label = paid_at_label or s("paid_today")
    pdf_line = s("pdf_line", url=invoice_pdf_url) if invoice_pdf_url else ""

    text = s(
        "text",
        plan=plan_label,
        amount=amount_label,
        paid_at=paid_label,
        number=invoice_label,
        url=invoice_url,
        pdf_line=pdf_line,
        app_name=app_name,
    )
    details: list[tuple[str, str | None]] = [
        (f"{s('label_plan')}: {plan_label}", None),
        (f"{s('label_total')}: {amount_label}", None),
        (f"{s('label_date')}: {paid_label}", None),
        (f"{s('label_number')}: {invoice_label}", None),
    ]
    if invoice_pdf_url:
        details.append((s("pdf_detail"), invoice_pdf_url))

    html = _email_shell(
        app_name=app_name,
        eyebrow=s("eyebrow"),
        title=s("title"),
        intro=s("intro", amount=amount_label, plan=plan_label),
        preheader=s("preheader", amount=amount_label, plan=plan_label),
        logo_html=logo_html,
        cta_label=s("cta"),
        action_url=invoice_url,
        details_title=s("details_title"),
        details=details,
        note_title=s("note_title"),
        note=s("note"),
        footer_note=s("footer", app_name=app_name),
        language=language,
    )
    return html, text

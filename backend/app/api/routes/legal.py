import re
import unicodedata
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.dependencies import CurrentAdminUser, DbSession
from app.core.i18n import (
    DEFAULT_LANGUAGE,
    get_request_language,
    normalize_language,
)
from app.models import CompanyData, LegalDocument, LegalDocumentSection
from app.schemas.legal import (
    CompanyDataResponse,
    CompanyDataUpdate,
    LegalDocumentResponse,
    LegalDocumentSectionCreate,
    LegalDocumentSectionResponse,
    LegalDocumentSectionUpdate,
)
from app.services.audit import add_audit_log
from app.services.legal import PLACEHOLDER_KEYS, render_company_placeholders

router = APIRouter(prefix="/api/legal", tags=["legal"])

DOCUMENT_TITLES = {
    "terms_conditions": "Termeni si conditii",
    "privacy_policy": "Politica de confidentialitate",
}

DOCUMENT_FILES = {
    "terms_conditions": "terms.html",
    "privacy_policy": "privacy.html",
}

LEGAL_CONTENT_DIR = (
    Path(__file__).resolve().parents[4] / "frontend" / "src" / "content" / "legal"
)

DEFAULT_COMPANY_DATA = {
    "name": "[DENUMIRE_FIRMA]",
    "social_location": "[SEDIU_SOCIAL]",
    "cui": "[CUI]",
    "register_number": "[NR_REGISTRUL_COMERTULUI]",
    "social_capital": "[CAPITAL_SOCIAL]",
    "email": "contact@example.com",
    "privacy_email": "privacy@example.com",
    "phone": "[TELEFON]",
    "ai_provider": "[FURNIZOR_AI]",
    "payment_provider": "[FURNIZOR_PLATI]",
    "hosting_provider": "[FURNIZOR_HOSTING]",
}


def _client_context(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    ip_address = request.client.host if request.client is not None else None
    return user_agent, ip_address


def _strip_tags(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value).strip()


def _read_seed_content(slug: str) -> str:
    title = DOCUMENT_TITLES[slug]
    file_name = DOCUMENT_FILES[slug]

    try:
        return (LEGAL_CONTENT_DIR / file_name).read_text(encoding="utf-8")
    except OSError:
        return (
            f"<article><h1>{title}</h1>"
            "<p>Document in curs de configurare.</p></article>"
        )


def _split_seed_sections(content: str) -> list[LegalDocumentSection]:
    body = re.sub(r"</?article[^>]*>", "", content, flags=re.IGNORECASE).strip()
    parts = [part.strip() for part in re.split(r"(?=<h2\b)", body) if part.strip()]
    now = datetime.now(UTC)

    if not parts:
        parts = ["<p>Document in curs de configurare.</p>"]

    sections: list[LegalDocumentSection] = []
    for index, part in enumerate(parts):
        title_match = re.search(
            r"<h[12][^>]*>(.*?)</h[12]>",
            part,
            flags=re.IGNORECASE | re.DOTALL,
        )
        title = _strip_tags(title_match.group(1)) if title_match else "Introducere"
        sections.append(
            LegalDocumentSection(
                section_key="intro" if index == 0 else f"section_{index:02d}",
                title=title or "Sectiune",
                content=part,
                sort_order=index,
                last_date_modified=now,
            )
        )

    return sections


def _section_key_base(title: str) -> str:
    ascii_title = (
        unicodedata.normalize("NFKD", title)
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    key = re.sub(r"[^a-z0-9]+", "_", ascii_title.lower()).strip("_")
    return (key or "sectiune")[:48]


def _unique_section_key(document: LegalDocument, title: str) -> str:
    existing_keys = {section.section_key for section in document.sections}
    base_key = _section_key_base(title)
    if base_key not in existing_keys:
        return base_key

    for index in range(2, 1000):
        suffix = f"_{index}"
        key = f"{base_key[: 80 - len(suffix)]}{suffix}"
        if key not in existing_keys:
            return key

    return f"{base_key[:39]}_{uuid.uuid4().hex[:8]}"


def _next_section_sort_order(document: LegalDocument) -> int:
    if not document.sections:
        return 0
    return max(section.sort_order for section in document.sections) + 1


def _normalize_section_sort_order(sections: list[LegalDocumentSection]) -> None:
    for index, section in enumerate(sorted(sections, key=lambda item: item.sort_order)):
        section.sort_order = index


def _find_document_section(
    document: LegalDocument,
    section_key: str,
) -> LegalDocumentSection | None:
    return next(
        (
            current_section
            for current_section in document.sections
            if current_section.section_key == section_key
        ),
        None,
    )


async def _get_company_data(session: DbSession) -> CompanyData:
    company_data = await session.scalar(select(CompanyData).order_by(CompanyData.id))
    if company_data is not None:
        return company_data

    company_data = CompanyData(**DEFAULT_COMPANY_DATA)
    session.add(company_data)
    await session.commit()
    await session.refresh(company_data)
    return company_data


async def _load_document(
    session: DbSession,
    slug: str,
    locale: str,
) -> LegalDocument | None:
    return await session.scalar(
        select(LegalDocument)
        .options(selectinload(LegalDocument.sections))
        .where(
            LegalDocument.slug == slug,
            LegalDocument.locale == locale,
        )
    )


async def _get_document(
    session: DbSession,
    slug: str,
    locale: str = DEFAULT_LANGUAGE,
) -> LegalDocument:
    """The document in the requested language, or the Romanian original.

    Romanian is the authoritative version: it is the one that is seeded, the
    one an admin must keep current, and the one served whenever a translation
    has not been written yet. A visitor never gets an empty legal page.
    """
    if slug not in DOCUMENT_TITLES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documentul legal nu exista.",
        )

    if locale != DEFAULT_LANGUAGE:
        translated = await _load_document(session, slug, locale)
        if translated is not None:
            return translated

    document = await _load_document(session, slug, DEFAULT_LANGUAGE)
    if document is not None:
        return document

    now = datetime.now(UTC)
    document = LegalDocument(
        slug=slug,
        locale=DEFAULT_LANGUAGE,
        title=DOCUMENT_TITLES[slug],
        last_date_modified=now,
    )
    document.sections = _split_seed_sections(_read_seed_content(slug))

    session.add(document)
    await session.commit()

    document = await _load_document(session, slug, DEFAULT_LANGUAGE)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documentul legal nu a putut fi initializat.",
        )
    return document


def _document_response(
    document: LegalDocument,
    company_data: CompanyData,
) -> LegalDocumentResponse:
    sections = sorted(document.sections, key=lambda section: section.sort_order)
    content_html = "\n".join(section.content for section in sections)
    rendered_sections = [
        LegalDocumentSectionResponse(
            id=section.id,
            section_key=section.section_key,
            title=section.title,
            content=section.content,
            rendered_content=render_company_placeholders(
                section.content,
                company_data,
                last_date_modified=document.last_date_modified,
            ),
            sort_order=section.sort_order,
            last_date_modified=section.last_date_modified,
        )
        for section in sections
    ]

    return LegalDocumentResponse(
        id=document.id,
        slug=document.slug,
        locale=document.locale,
        is_translation=document.locale != DEFAULT_LANGUAGE,
        title=document.title,
        content_html=f"<article>\n{content_html}\n</article>",
        rendered_content_html=(
            "<article>\n"
            + "\n".join(section.rendered_content for section in rendered_sections)
            + "\n</article>"
        ),
        last_date_modified=document.last_date_modified,
        sections=rendered_sections,
        available_variables=[f"{{{key}}}" for key in PLACEHOLDER_KEYS],
    )


@router.get("/company-data", response_model=CompanyDataResponse)
async def get_company_data(session: DbSession) -> CompanyDataResponse:
    company_data = await _get_company_data(session)
    return CompanyDataResponse.model_validate(company_data)


@router.get("/documents/{slug}", response_model=LegalDocumentResponse)
async def get_legal_document(
    slug: str,
    session: DbSession,
) -> LegalDocumentResponse:
    document = await _get_document(session, slug, get_request_language())
    company_data = await _get_company_data(session)
    return _document_response(document, company_data)


@router.get("/admin/company-data", response_model=CompanyDataResponse)
async def get_admin_company_data(
    _: CurrentAdminUser,
    session: DbSession,
) -> CompanyDataResponse:
    company_data = await _get_company_data(session)
    return CompanyDataResponse.model_validate(company_data)


@router.put("/admin/company-data", response_model=CompanyDataResponse)
async def update_admin_company_data(
    payload: CompanyDataUpdate,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
) -> CompanyDataResponse:
    company_data = await _get_company_data(session)
    for field, value in payload.model_dump().items():
        setattr(company_data, field, str(value))
    company_data.last_date_modified = datetime.now(UTC)
    user_agent, ip_address = _client_context(request)
    add_audit_log(
        session,
        action="admin.company_data.updated",
        actor=admin_user,
        resource_type="company_data",
        resource_id=str(company_data.id),
        details={"fields": list(payload.model_dump().keys())},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await session.commit()
    await session.refresh(company_data)
    return CompanyDataResponse.model_validate(company_data)


async def _get_admin_document(
    session: DbSession,
    slug: str,
    locale: str,
) -> LegalDocument:
    """The editable document for one language, seeded from Romanian if new.

    Opening a language for the first time copies the Romanian sections across,
    so the translator starts from the real structure and text instead of a
    blank page - and no section can be quietly forgotten.
    """
    target = normalize_language(locale)
    if target == DEFAULT_LANGUAGE:
        return await _get_document(session, slug, DEFAULT_LANGUAGE)

    existing = await _load_document(session, slug, target)
    if existing is not None:
        return existing

    source = await _get_document(session, slug, DEFAULT_LANGUAGE)
    now = datetime.now(UTC)
    document = LegalDocument(
        slug=slug,
        locale=target,
        title=source.title,
        last_date_modified=now,
    )
    document.sections = [
        LegalDocumentSection(
            section_key=section.section_key,
            title=section.title,
            content=section.content,
            sort_order=section.sort_order,
            last_date_modified=now,
        )
        for section in sorted(source.sections, key=lambda item: item.sort_order)
    ]
    session.add(document)
    await session.commit()

    created = await _load_document(session, slug, target)
    if created is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Documentul legal nu a putut fi creat.",
        )
    return created


@router.get("/admin/documents/{slug}", response_model=LegalDocumentResponse)
async def get_admin_legal_document(
    slug: str,
    _: CurrentAdminUser,
    session: DbSession,
    locale: str = DEFAULT_LANGUAGE,
) -> LegalDocumentResponse:
    document = await _get_admin_document(session, slug, locale)
    company_data = await _get_company_data(session)
    return _document_response(document, company_data)


@router.post(
    "/admin/documents/{slug}/sections",
    response_model=LegalDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_admin_legal_document_section(
    slug: str,
    payload: LegalDocumentSectionCreate,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    locale: str = DEFAULT_LANGUAGE,
) -> LegalDocumentResponse:
    document = await _get_admin_document(session, slug, locale)
    now = datetime.now(UTC)
    section_id = uuid.uuid4()
    section = LegalDocumentSection(
        id=section_id,
        section_key=_unique_section_key(document, payload.title),
        title=payload.title,
        content=payload.content,
        sort_order=_next_section_sort_order(document),
        last_date_modified=now,
    )
    document.sections.append(section)
    document.last_date_modified = now

    user_agent, ip_address = _client_context(request)
    add_audit_log(
        session,
        action="admin.legal_document_section.created",
        actor=admin_user,
        resource_type="legal_document_section",
        resource_id=str(section_id),
        details={
            "document_slug": slug,
            "section_key": section.section_key,
            "section_title": payload.title,
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await session.commit()

    document = await _get_admin_document(session, slug, locale)
    company_data = await _get_company_data(session)
    return _document_response(document, company_data)


@router.patch(
    "/admin/documents/{slug}/sections/{section_key}",
    response_model=LegalDocumentResponse,
)
async def update_admin_legal_document_section(
    slug: str,
    section_key: str,
    payload: LegalDocumentSectionUpdate,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    locale: str = DEFAULT_LANGUAGE,
) -> LegalDocumentResponse:
    document = await _get_admin_document(session, slug, locale)
    section = _find_document_section(document, section_key)
    if section is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sectiunea legala nu exista.",
        )

    section.title = payload.title
    section.content = payload.content
    section.last_date_modified = datetime.now(UTC)
    document.last_date_modified = datetime.now(UTC)
    user_agent, ip_address = _client_context(request)
    add_audit_log(
        session,
        action="admin.legal_document_section.updated",
        actor=admin_user,
        resource_type="legal_document_section",
        resource_id=str(section.id),
        details={
            "document_slug": slug,
            "section_key": section_key,
            "section_title": payload.title,
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await session.commit()
    await session.refresh(document)

    document = await _get_admin_document(session, slug, locale)
    company_data = await _get_company_data(session)
    return _document_response(document, company_data)


@router.delete(
    "/admin/documents/{slug}/sections/{section_key}",
    response_model=LegalDocumentResponse,
)
async def delete_admin_legal_document_section(
    slug: str,
    section_key: str,
    request: Request,
    admin_user: CurrentAdminUser,
    session: DbSession,
    locale: str = DEFAULT_LANGUAGE,
) -> LegalDocumentResponse:
    document = await _get_admin_document(session, slug, locale)
    section = _find_document_section(document, section_key)
    if section is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sectiunea legala nu exista.",
        )
    if len(document.sections) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Documentul trebuie sa pastreze cel putin o sectiune.",
        )

    document.sections.remove(section)
    _normalize_section_sort_order(document.sections)
    now = datetime.now(UTC)
    document.last_date_modified = now

    user_agent, ip_address = _client_context(request)
    add_audit_log(
        session,
        action="admin.legal_document_section.deleted",
        actor=admin_user,
        resource_type="legal_document_section",
        resource_id=str(section.id),
        details={
            "document_slug": slug,
            "section_key": section.section_key,
            "section_title": section.title,
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await session.commit()

    document = await _get_admin_document(session, slug, locale)
    company_data = await _get_company_data(session)
    return _document_response(document, company_data)

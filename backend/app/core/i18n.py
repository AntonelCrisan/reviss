"""Backend localisation: request language, message catalogs, translation.

Two catalogs live in ``app/i18n``:

* ``messages.json`` — user-facing sentences the code raises in Romanian
  (``HTTPException`` details, service errors, success messages), keyed by
  that Romanian text. They are translated at the HTTP boundary, so the code
  keeps raising plain Romanian strings and the retry prompts the AI sees are
  untouched. ``app.core.i18n_inventory`` keeps this catalog complete.
* ``strings.json`` — keyed strings for content the backend composes itself
  (emails, notifications, validation errors), with all three languages.
"""

from __future__ import annotations

import json
import re
from contextvars import ContextVar
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Final, Literal

Language = Literal["ro", "en", "fr"]

SUPPORTED_LANGUAGES: Final[tuple[Language, ...]] = ("ro", "en", "fr")
DEFAULT_LANGUAGE: Final[Language] = "ro"
# Written by the frontend whenever the visitor picks a language, so anonymous
# flows (register, password reset, contact) get the right language too.
LANGUAGE_COOKIE_NAME: Final = "reviss-language"
CATALOG_DIR: Final = Path(__file__).resolve().parents[1] / "i18n"

_PLACEHOLDER_PATTERN = re.compile(r"\{([^{}]+)\}")


@dataclass(frozen=True)
class RequestLanguage:
    language: Language
    # True when the visitor chose it in the UI (cookie). An explicit choice
    # wins over the account preference, which may lag behind the UI.
    explicit: bool


_request_language: ContextVar[RequestLanguage | None] = ContextVar(
    "reviss_request_language", default=None
)


def normalize_language(value: object, default: Language = DEFAULT_LANGUAGE) -> Language:
    if isinstance(value, str):
        candidate = value.strip().lower().replace("_", "-").split("-", 1)[0]
        if candidate in SUPPORTED_LANGUAGES:
            return candidate  # type: ignore[return-value]
    return default


def parse_accept_language(header: str | None) -> Language | None:
    """First supported language from an Accept-Language header, by weight."""
    if not header:
        return None

    candidates: list[tuple[float, int, str]] = []
    for position, part in enumerate(header.split(",")):
        tag, _, params = part.strip().partition(";")
        if not tag:
            continue
        weight = 1.0
        for param in params.split(";"):
            key, _, value = param.strip().partition("=")
            if key == "q":
                try:
                    weight = float(value)
                except ValueError:
                    weight = 0.0
        if weight > 0:
            candidates.append((-weight, position, tag))

    for _, _, tag in sorted(candidates):
        language = normalize_language(tag, default=None)  # type: ignore[arg-type]
        if language is not None:
            return language
    return None


def resolve_request_language(
    *,
    cookie: str | None,
    accept_language: str | None,
) -> RequestLanguage:
    cookie_language = normalize_language(cookie, default=None)  # type: ignore[arg-type]
    if cookie_language is not None:
        return RequestLanguage(language=cookie_language, explicit=True)

    header_language = parse_accept_language(accept_language)
    return RequestLanguage(
        language=header_language or DEFAULT_LANGUAGE,
        explicit=False,
    )


def set_request_language(language: object, *, explicit: bool = False) -> None:
    _request_language.set(
        RequestLanguage(language=normalize_language(language), explicit=explicit)
    )


def apply_user_language(preference: object) -> None:
    """Use the account preference unless the visitor picked a language in the UI."""
    current = _request_language.get()
    if current is not None and current.explicit:
        return
    _request_language.set(
        RequestLanguage(language=normalize_language(preference), explicit=False)
    )


def get_request_language() -> Language:
    current = _request_language.get()
    return current.language if current is not None else DEFAULT_LANGUAGE


def language_for_user(preference: object) -> Language:
    """Language for something addressed to a specific account (an email, a
    notification): the UI choice when it is explicit on this request, else the
    account preference. Outside a request (cron, webhooks) that is the
    preference alone."""
    current = _request_language.get()
    if current is not None and current.explicit:
        return current.language
    return normalize_language(preference)


# --------------------------------------------------------------------------- catalogs


def _load_catalog(name: str) -> dict[str, dict[str, str]]:
    path = CATALOG_DIR / name
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def message_catalog() -> dict[str, dict[str, str]]:
    return _load_catalog("messages.json")


@lru_cache(maxsize=1)
def string_catalog() -> dict[str, dict[str, str]]:
    return _load_catalog("strings.json")


def _template_pattern(template: str) -> tuple[re.Pattern[str], list[str]]:
    names: list[str] = []
    parts: list[str] = []
    cursor = 0
    for match in _PLACEHOLDER_PATTERN.finditer(template):
        parts.append(re.escape(template[cursor : match.start()]))
        names.append(match.group(1))
        parts.append(f"(?P<p{len(names) - 1}>.+?)")
        cursor = match.end()
    parts.append(re.escape(template[cursor:]))
    return re.compile("".join(parts), re.DOTALL), names


@lru_cache(maxsize=1)
def _message_templates() -> list[tuple[re.Pattern[str], list[str], dict[str, str]]]:
    templates = []
    for source, translations in message_catalog().items():
        if "{" in source:
            pattern, names = _template_pattern(source)
            templates.append((pattern, names, translations))
    return templates


def _fill(translation: str, values: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        return values.get(match.group(1), match.group(0))

    return _PLACEHOLDER_PATTERN.sub(replace, translation)


def translate_message(text: Any, language: Language | None = None) -> Any:
    """Translate one Romanian message the code raised; unknown text comes back as is."""
    if not isinstance(text, str):
        return text
    target = language or get_request_language()
    if target == DEFAULT_LANGUAGE:
        return text

    exact = message_catalog().get(text)
    if exact is not None:
        return exact.get(target) or text

    for pattern, names, translations in _message_templates():
        match = pattern.fullmatch(text)
        if match is None:
            continue
        translation = translations.get(target)
        if not translation:
            return text
        values: dict[str, str] = {}
        for index, name in enumerate(names):
            values.setdefault(name, match.group(f"p{index}"))
        return _fill(translation, values)

    return text


def translate_detail(detail: Any, language: Language | None = None) -> Any:
    """Translate an error ``detail`` in either shape the API uses."""
    if isinstance(detail, str):
        return translate_message(detail, language)
    if isinstance(detail, dict) and isinstance(detail.get("message"), str):
        return {**detail, "message": translate_message(detail["message"], language)}
    return detail


def t(key: str, language: Language | None = None, **params: Any) -> str:
    """A keyed string from ``strings.json`` in the given (or request) language."""
    target = language or get_request_language()
    entry = string_catalog().get(key)
    if entry is None:
        return key
    template = entry.get(target) or entry.get(DEFAULT_LANGUAGE) or key
    if not params:
        return template
    return _fill(template, {name: str(value) for name, value in params.items()})


def plural_key(base: str, count: int) -> str:
    return f"{base}.one" if count == 1 else f"{base}.other"

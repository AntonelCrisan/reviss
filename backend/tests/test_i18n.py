"""Backend localisation: request language, catalogs, and the HTTP boundary."""

from fastapi.testclient import TestClient

from app.core.i18n import (
    LANGUAGE_COOKIE_NAME,
    RequestLanguage,
    _request_language,
    apply_user_language,
    get_request_language,
    language_for_user,
    message_catalog,
    parse_accept_language,
    resolve_request_language,
    set_request_language,
    string_catalog,
    t,
    translate_detail,
    translate_message,
)
from app.core.i18n_inventory import missing_translations
from app.main import app
from app.services.email import (
    invoice_paid_email,
    notification_digest_email,
    verification_email,
)


def _reset_language() -> None:
    _request_language.set(None)


# ----------------------------------------------------------------- catalogs


def test_every_raised_message_has_english_and_french() -> None:
    missing = missing_translations(message_catalog())
    assert missing == {}, f"Untranslated messages: {sorted(missing)}"


def test_every_keyed_string_has_all_three_languages() -> None:
    incomplete = {
        key: sorted(set(("ro", "en", "fr")) - {k for k, v in entry.items() if v})
        for key, entry in string_catalog().items()
        if any(not entry.get(language) for language in ("ro", "en", "fr"))
    }
    assert incomplete == {}


# ----------------------------------------------------------------- resolution


def test_accept_language_picks_the_heaviest_supported_tag() -> None:
    assert parse_accept_language("de, fr;q=0.8, en;q=0.9") == "en"
    assert parse_accept_language("fr-FR,fr;q=0.9,en-US;q=0.8") == "fr"
    assert parse_accept_language("de-DE") is None
    assert parse_accept_language(None) is None


def test_cookie_beats_accept_language_and_marks_the_choice_explicit() -> None:
    resolved = resolve_request_language(cookie="en", accept_language="fr")
    assert resolved == RequestLanguage(language="en", explicit=True)
    resolved = resolve_request_language(cookie="klingon", accept_language="fr")
    assert resolved == RequestLanguage(language="fr", explicit=False)
    resolved = resolve_request_language(cookie=None, accept_language=None)
    assert resolved == RequestLanguage(language="ro", explicit=False)


def test_account_preference_only_fills_in_when_the_ui_did_not_choose() -> None:
    _reset_language()
    set_request_language("fr", explicit=False)
    apply_user_language("en")
    assert get_request_language() == "en"

    set_request_language("fr", explicit=True)
    apply_user_language("en")
    assert get_request_language() == "fr"
    assert language_for_user("en") == "fr"

    _reset_language()
    assert get_request_language() == "ro"
    assert language_for_user("en") == "en"
    assert language_for_user("nope") == "ro"


# ----------------------------------------------------------------- translation


def test_exact_messages_and_templates_are_translated() -> None:
    assert (
        translate_message("Autentificarea este necesară.", "en")
        == "You need to be signed in."
    )
    assert (
        translate_message("Planul tau permite maximum 12 intrebari intr-un quiz.", "fr")
        == "Votre forfait autorise au maximum 12 questions par quiz."
    )
    assert (
        translate_message(
            "Documentul raport final.pdf depășește limita de 10MB.", "en"
        )
        == "The document raport final.pdf exceeds the 10MB limit."
    )


def test_romanian_and_unknown_text_pass_through() -> None:
    assert translate_message("Autentificarea este necesară.", "ro") == (
        "Autentificarea este necesară."
    )
    assert translate_message("Un text care nu e in catalog.", "en") == (
        "Un text care nu e in catalog."
    )
    assert translate_message(None, "en") is None


def test_detail_dicts_keep_their_code() -> None:
    detail = {
        "code": "PROJECT_DEACTIVATED",
        "message": "Alege un plan activ pentru a continua.",
    }
    assert translate_detail(detail, "en") == {
        "code": "PROJECT_DEACTIVATED",
        "message": "Choose an active plan to continue.",
    }


def test_keyed_strings_fill_params_and_fall_back_to_romanian() -> None:
    assert t("notification.streak.title", "en", days=7) == "7-day streak!"
    assert t("notification.streak.title", "ro", days=7) == "Streak de 7 zile!"
    assert t("missing.key", "fr") == "missing.key"


# ----------------------------------------------------------------- HTTP boundary


def test_http_errors_follow_the_language_cookie_and_header() -> None:
    with TestClient(app) as client:
        romanian = client.get("/api/auth/me")
        english = client.get(
            "/api/auth/me", headers={"cookie": f"{LANGUAGE_COOKIE_NAME}=en"}
        )
        french = client.get("/api/auth/me", headers={"accept-language": "fr-FR"})
        cookie_wins = client.get(
            "/api/auth/me",
            headers={
                "accept-language": "fr-FR",
                "cookie": f"{LANGUAGE_COOKIE_NAME}=en",
            },
        )

    assert romanian.status_code == 401
    assert romanian.json()["detail"] == "Autentificarea este necesară."
    assert english.json()["detail"] == "You need to be signed in."
    assert french.json()["detail"] == "Vous devez être connecté."
    assert cookie_wins.json()["detail"] == "You need to be signed in."


def test_validation_errors_are_localized_and_lose_the_pydantic_prefix() -> None:
    payload = {"email": "not-an-email", "password": ""}
    with TestClient(app) as client:
        romanian = client.post("/api/auth/login", json=payload)
        english = client.post(
            "/api/auth/login",
            json=payload,
            headers={"cookie": f"{LANGUAGE_COOKIE_NAME}=en"},
        )

    assert romanian.status_code == 422
    messages_ro = {tuple(e["loc"]): e["msg"] for e in romanian.json()["detail"]}
    messages_en = {tuple(e["loc"]): e["msg"] for e in english.json()["detail"]}
    assert messages_ro[("body", "email")] == "Adresa de email nu este validă."
    assert messages_en[("body", "email")] == "The email address is not valid."
    assert messages_ro[("body", "password")] == (
        "Textul trebuie să aibă cel puțin 1 caractere."
    )
    assert messages_en[("body", "password")] == "Must be at least 1 characters long."
    assert not any(msg.startswith("Value error") for msg in messages_en.values())


# ----------------------------------------------------------------- emails


def test_emails_render_in_the_requested_language() -> None:
    html, text = verification_email(
        verification_url="https://reviss.app/verify?token=abc",
        logo_html="<b>Reviss</b>",
        language="en",
    )
    assert '<html lang="en">' in html
    assert "Confirm your email address" in html
    assert "If the button does not open" in html
    assert text.startswith("Welcome to Reviss.")

    html_fr, text_fr = verification_email(
        verification_url="https://reviss.app/verify?token=abc",
        logo_html="<b>Reviss</b>",
        language="fr",
    )
    assert "Confirmez votre adresse email" in html_fr
    assert text_fr.startswith("Bienvenue sur Reviss.")

    html_ro, text_ro = verification_email(
        verification_url="https://reviss.app/verify?token=abc",
        logo_html="<b>Reviss</b>",
    )
    assert "Confirmă adresa de email" in html_ro
    assert "Bine ai venit în Reviss." in text_ro


def test_invoice_and_digest_emails_translate_their_labels() -> None:
    html, text = invoice_paid_email(
        invoice_url="https://stripe.test/inv",
        invoice_pdf_url=None,
        invoice_number="INV-1",
        amount_label="29,00 RON",
        paid_at_label=None,
        plan_name=None,
        logo_html="",
        language="fr",
    )
    # The shell splits "label: value" rows into a label span and the value.
    assert "Total payé" in html and "29,00 RON" in html
    assert "Total payé : 29,00 RON" in text
    assert "aujourd'hui" in text
    assert "l'abonnement Reviss" in text

    html, text = notification_digest_email(
        items=[("A", "one", None), ("B", "two", "https://reviss.app/p")],
        app_url="https://reviss.app",
        logo_html="",
        language="en",
    )
    assert "You have 2 updates in your account" in html
    assert text.endswith("Open Reviss: https://reviss.app")

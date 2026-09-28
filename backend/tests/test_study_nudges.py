"""The getting-started nudges: who gets one, when, and when we stop."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

import app.services.study_nudges as nudges_module
from app.core.security import unsubscribe_token, user_id_from_unsubscribe_token
from app.services.email import study_nudge_email
from app.services.study_nudges import (
    NUDGE_FIRST_DAYS,
    NUDGE_REPEAT_DAYS,
    NUDGE_SECOND_DAYS,
    StudyNudgeService,
)

SECRET = "a-secure-session-secret-with-more-than-32-characters"


def settings():
    return SimpleNamespace(
        public_app_url="https://www.reviss.app",
        email_logo_url=None,
        session_secret=SimpleNamespace(get_secret_value=lambda: SECRET),
    )


def user(days_old=NUDGE_FIRST_DAYS, now=None):
    now = now or datetime.now(UTC)
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="student@example.com",
        language_preference="ro",
        created_at=now - timedelta(days=days_old),
    )


def service_for(
    monkeypatch,
    *,
    rows,
    sent_before=0,
    last_sent_at=None,
    emailed_recently=False,
    tips_on=True,
    email_on=True,
    project_id=None,
):
    """A service whose database answers are fixed, so only the rules are tested."""
    added = []
    scalars = [
        uuid.uuid4() if emailed_recently else None,  # a recent email, or none
        project_id,  # the project to link, when there is one
    ]

    session = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                SimpleNamespace(all=lambda: rows),
                SimpleNamespace(one=lambda: (sent_before, last_sent_at)),
            ]
        ),
        scalar=AsyncMock(side_effect=scalars),
        add=Mock(side_effect=added.append),
        flush=AsyncMock(),
        commit=AsyncMock(),
    )
    preferences = SimpleNamespace(
        notify_tips_reminders=tips_on, notify_email_enabled=email_on
    )
    monkeypatch.setattr(
        nudges_module,
        "PreferencesService",
        lambda _session: SimpleNamespace(
            get=AsyncMock(return_value=SimpleNamespace(preferences=preferences))
        ),
    )
    sent_emails = []
    monkeypatch.setattr(
        nudges_module,
        "EmailService",
        lambda _settings: SimpleNamespace(
            send=AsyncMock(side_effect=lambda message: sent_emails.append(message))
        ),
    )
    service = StudyNudgeService(session, settings())
    return service, added, sent_emails


def run(service):
    return asyncio.run(service.run_for_all_users())


def test_an_account_with_no_project_gets_the_first_nudge(monkeypatch):
    student = user(days_old=3)
    service, added, emails = service_for(monkeypatch, rows=[(student, False, False)])

    assert run(service) == 1
    notification = added[0]
    assert notification.type == "study_nudge"
    assert notification.dedupe_key == "study_nudge:1"
    assert notification.emailed_at is not None
    message = emails[0]
    assert message.to == student.email
    assert "curs" in message.subject.lower()
    # The mail client's own unsubscribe button works without opening the mail,
    # so its link has to be one that answers a POST.
    assert message.headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert (
        "/api/auth/notifications/unsubscribe?token="
        in message.headers["List-Unsubscribe"]
    )
    # The link the reader clicks stays the page that says what happened.
    assert "/dezabonare?token=" in message.html


def test_a_student_who_studied_is_left_alone(monkeypatch):
    service, added, emails = service_for(
        monkeypatch, rows=[(user(days_old=30), True, True)]
    )

    assert run(service) == 0
    assert added == [] and emails == []


def test_nothing_goes_out_before_the_third_day(monkeypatch):
    service, added, emails = service_for(
        monkeypatch, rows=[(user(days_old=1), False, False)]
    )

    assert run(service) == 0
    assert emails == []


@pytest.mark.parametrize(
    ("sent_before", "days_since_last", "expected"),
    [
        (1, NUDGE_SECOND_DAYS - NUDGE_FIRST_DAYS - 1, 0),  # day 9: too early
        (1, NUDGE_SECOND_DAYS - NUDGE_FIRST_DAYS, 1),  # day 10: the second one
        (2, NUDGE_REPEAT_DAYS - 1, 0),  # 13 days after: too early
        (2, NUDGE_REPEAT_DAYS, 1),  # a fortnight after: another one
        (7, NUDGE_REPEAT_DAYS, 1),  # and it keeps going
    ],
)
def test_the_later_nudges_keep_their_distance(
    monkeypatch, sent_before, days_since_last, expected
):
    now = datetime.now(UTC)
    service, _added, emails = service_for(
        monkeypatch,
        rows=[(user(days_old=90, now=now), False, False)],
        sent_before=sent_before,
        last_sent_at=now - timedelta(days=days_since_last),
    )

    assert run(service) == expected
    assert len(emails) == expected


def test_another_email_today_holds_the_nudge_back(monkeypatch):
    service, added, emails = service_for(
        monkeypatch, rows=[(user(days_old=5), False, False)], emailed_recently=True
    )

    assert run(service) == 0
    assert added == [] and emails == []


def test_the_switch_stops_everything_and_the_email_switch_only_the_email(monkeypatch):
    service, added, emails = service_for(
        monkeypatch, rows=[(user(days_old=5), False, False)], tips_on=False
    )
    assert run(service) == 0
    assert added == []

    service, added, emails = service_for(
        monkeypatch, rows=[(user(days_old=5), False, False)], email_on=False
    )
    assert run(service) == 0
    # The bell still gets it; only the email is off.
    assert added[0].type == "study_nudge"
    assert added[0].emailed_at is None
    assert emails == []


def test_a_generated_project_nobody_studied_gets_the_other_wording(monkeypatch):
    project_id = uuid.uuid4()
    service, added, emails = service_for(
        monkeypatch,
        rows=[(user(days_old=4), True, False)],
        project_id=project_id,
    )

    assert run(service) == 1
    assert added[0].project_id == project_id
    # The link goes to the project, not to the upload page.
    assert str(project_id) in emails[0].html


def test_repeats_rotate_their_closing_line():
    seen = set()
    for step_index in range(3):
        _subject, html, _text = study_nudge_email(
            branch="start",
            step="repeat",
            tip=f"Sfatul {step_index}",
            action_url="https://www.reviss.app/myaccount",
            unsubscribe_url="https://www.reviss.app/dezabonare?token=x",
            logo_html="",
            language="ro",
        )
        seen.add(f"Sfatul {step_index}" in html)
    assert seen == {True}


def test_the_unsubscribe_endpoint_turns_the_switch_off(monkeypatch):
    """The link from the email reaches the right route, with the token intact."""
    from fastapi.testclient import TestClient
    from pydantic import SecretStr

    import app.api.routes.auth as auth_routes
    from app.core.config import get_settings
    from app.db.session import get_db_session
    from app.main import app

    student = user()
    updates = []
    session = SimpleNamespace(
        scalar=AsyncMock(return_value=student), commit=AsyncMock()
    )
    monkeypatch.setattr(
        auth_routes,
        "PreferencesService",
        lambda _session: SimpleNamespace(
            update=AsyncMock(side_effect=lambda _user, **kwargs: updates.append(kwargs))
        ),
    )
    settings = get_settings().model_copy(update={"session_secret": SecretStr(SECRET)})
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(app) as client:
            token = unsubscribe_token(student.id, SECRET)
            good = client.post(f"/api/auth/notifications/unsubscribe?token={token}")
            forged = client.post("/api/auth/notifications/unsubscribe?token=nope")
    finally:
        app.dependency_overrides.clear()

    assert good.status_code == 200
    assert good.json() == {"unsubscribed": True}
    assert updates == [{"notify_tips_reminders": False}]
    assert forged.json() == {"unsubscribed": False}


def test_the_unsubscribe_link_only_works_with_our_signature():
    student_id = uuid.uuid4()
    token = unsubscribe_token(student_id, SECRET)

    assert user_id_from_unsubscribe_token(token, SECRET) == student_id
    assert user_id_from_unsubscribe_token(token, "another-secret-entirely") is None
    assert user_id_from_unsubscribe_token(f"{uuid.uuid4().hex}.forged", SECRET) is None

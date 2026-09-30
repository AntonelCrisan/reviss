"""Profile pictures: what we accept, what we serve, what we refuse."""

import asyncio
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_auth_service, get_current_user
from app.db.session import get_db_session
from app.main import app
from app.models import User
from app.services.avatars import (
    MAX_AVATAR_BYTES,
    AvatarRejectedError,
    AvatarService,
    validated_avatar,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"restul imaginii"
JPEG = b"\xff\xd8\xff" + b"restul imaginii"
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"restul imaginii"


def build_user() -> User:
    return User(
        id=uuid.uuid4(),
        email="student@example.com",
        full_name="Student Test",
        password_hash="x",
        is_active=True,
        role="user",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        terms_accepted_at=datetime.now(UTC),
        terms_version="2026-06-11",
        theme_preference="system",
        language_preference="ro",
    )


@pytest.mark.parametrize(
    ("content_type", "data"),
    [("image/png", PNG), ("image/jpeg", JPEG), ("image/webp", WEBP)],
)
def test_the_three_formats_a_browser_can_produce_are_accepted(content_type, data):
    assert validated_avatar(content_type, data) == content_type


@pytest.mark.parametrize(
    ("content_type", "data"),
    [
        # A script dressed as a picture: we serve these back from our own
        # domain, so the bytes have to agree with the label.
        ("image/png", b"<svg onload=alert(1)>"),
        ("image/svg+xml", b"<svg></svg>"),
        ("text/html", b"<h1>salut</h1>"),
        ("image/png", b""),
    ],
)
def test_anything_that_is_not_a_picture_is_refused(content_type, data):
    with pytest.raises(AvatarRejectedError):
        validated_avatar(content_type, data)


def test_a_picture_larger_than_the_limit_is_refused():
    with pytest.raises(AvatarRejectedError):
        validated_avatar("image/png", PNG + b"x" * MAX_AVATAR_BYTES)


def test_the_content_type_is_normalised_before_it_is_trusted():
    assert validated_avatar("Image/PNG; charset=binary", PNG) == "image/png"


def test_saving_marks_the_user_and_removing_clears_it():
    user = build_user()
    added: list[object] = []
    session = SimpleNamespace(
        get=AsyncMock(return_value=None),
        add=added.append,
        execute=AsyncMock(),
    )
    service = AvatarService(session)

    asyncio.run(service.save(user=user, content_type="image/png", data=PNG))
    assert user.avatar_updated_at is not None
    assert added[0].image == PNG

    asyncio.run(service.remove(user=user))
    assert user.avatar_updated_at is None


def test_the_picture_travels_the_whole_way_and_comes_back(monkeypatch):
    """Upload, then read it back exactly as it was sent."""
    user = build_user()
    stored: dict[str, object] = {}

    class _Session:
        async def get(self, _model, _key):
            return stored.get("avatar")

        def add(self, entity):
            stored["avatar"] = entity

        async def scalar(self, _statement):
            return stored.get("avatar")

        async def execute(self, _statement):
            stored.pop("avatar", None)

        async def commit(self):
            return None

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: _Session()
    app.dependency_overrides[get_auth_service] = lambda: SimpleNamespace(
        has_pending_account_deletion_request=AsyncMock(return_value=False),
    )

    try:
        with TestClient(app) as client:
            upload = client.put(
                "/api/auth/me/avatar",
                files={"file": ("avatar", PNG, "image/png")},
            )
            served = client.get("/api/auth/me/avatar")
            removed = client.delete("/api/auth/me/avatar")
            gone = client.get("/api/auth/me/avatar")
    finally:
        app.dependency_overrides.clear()

    assert upload.status_code == 200
    assert upload.json()["avatar_updated_at"] is not None
    assert served.status_code == 200
    assert served.content == PNG
    assert served.headers["content-type"] == "image/png"
    assert removed.json()["avatar_updated_at"] is None
    assert gone.status_code == 404


def test_an_upload_from_another_site_is_refused():
    """The guard has to read the real settings, not something a mock invented."""
    user = build_user()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: SimpleNamespace()
    app.dependency_overrides[get_auth_service] = lambda: SimpleNamespace(
        has_pending_account_deletion_request=AsyncMock(return_value=False),
    )

    try:
        with TestClient(app) as client:
            response = client.put(
                "/api/auth/me/avatar",
                files={"file": ("avatar", PNG, "image/png")},
                headers={"origin": "https://un-site-strain.example"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403

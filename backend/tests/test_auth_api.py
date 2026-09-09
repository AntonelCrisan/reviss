import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_auth_service, get_current_user
from app.api.routes.auth import _auth_rate_limit_buckets
from app.core.config import get_settings
from app.main import app
from app.models import User
from app.services.auth import (
    AccountDeletionRequestAlreadyPendingError,
    AuthResult,
    InvalidCredentialsError,
)
from app.services.google_oauth import GoogleOAuthError


def build_user() -> User:
    return User(
        id=uuid.uuid4(),
        email="student@example.com",
        full_name="Student Test",
        password_hash="not-returned-by-api",
        is_active=True,
        role="user",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        terms_accepted_at=datetime.now(UTC),
        terms_version="2026-06-11",
        theme_preference="system",
        language_preference="ro",
    )


class FakeAuthService:
    def __init__(
        self,
        *,
        persistent: bool = False,
        account_deletion_pending: bool = False,
        google_error: Exception | None = None,
    ) -> None:
        self.user = build_user()
        self.persistent = persistent
        self.account_deletion_pending = account_deletion_pending
        self.google_error = google_error

    async def register(self, *_: object, **__: object) -> AuthResult:
        return self._result()

    async def login(self, *_: object, **__: object) -> AuthResult:
        return self._result()

    async def login_with_google(self, *_: object, **__: object) -> AuthResult:
        if self.google_error is not None:
            raise self.google_error
        return self._result()

    async def verify_email(self, *_: object, **__: object) -> AuthResult:
        return self._result()

    async def request_password_reset(self, *_: object, **__: object) -> None:
        return None

    async def reset_password(self, *_: object, **__: object) -> None:
        return None

    async def change_password(self, *_: object, **__: object) -> int:
        return 0

    async def request_account_deletion(self, *_: object, **__: object) -> None:
        return None

    async def has_pending_account_deletion_request(
        self,
        *_: object,
        **__: object,
    ) -> bool:
        return self.account_deletion_pending

    async def logout(self, *_: object, **__: object) -> None:
        return None

    async def update_preferences(
        self,
        user: User,
        *,
        theme_preference: str | None = None,
        language_preference: str | None = None,
    ) -> User:
        if theme_preference is not None:
            user.theme_preference = theme_preference
        if language_preference is not None:
            user.language_preference = language_preference
        return user

    def _result(self) -> AuthResult:
        return AuthResult(
            user=self.user,
            session_token="test-session-token",
            expires_at=datetime.now(UTC) + timedelta(days=1),
            persistent=self.persistent,
        )


@pytest.fixture(autouse=True)
def clear_auth_rate_limiter() -> None:
    _auth_rate_limit_buckets.clear()
    yield
    _auth_rate_limit_buckets.clear()


def test_register_requests_email_confirmation_without_session_cookie() -> None:
    service = FakeAuthService()
    settings = get_settings().model_copy(
        update={"session_cookie_name": "revizzio_session"}
    )
    app.dependency_overrides[get_auth_service] = lambda: service
    app.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/auth/register",
                json={
                    "full_name": "Student Test",
                    "email": "student@example.com",
                    "password": "ParolaSigura123",
                    "accepted_terms": True,
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json() == {
        "message": (
            "Ți-am trimis un email de confirmare. Contul va fi creat după "
            "validarea adresei de email."
        )
    }
    assert "set-cookie" not in response.headers


def test_google_callback_sets_session_cookie() -> None:
    service = FakeAuthService()
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/auth/google/callback",
                json={"code": "test-authorization-code"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "set-cookie" in response.headers


def test_google_callback_invalid_code_returns_400() -> None:
    service = FakeAuthService(google_error=GoogleOAuthError("bad code"))
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/auth/google/callback",
                json={"code": "test-authorization-code"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "set-cookie" not in response.headers


def test_login_rate_limit_blocks_repeated_attempts() -> None:
    service = FakeAuthService()
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            payload = {
                "email": "student@example.com",
                "password": "ParolaSigura123",
            }
            for _ in range(10):
                assert client.post("/api/auth/login", json=payload).status_code == 200

            response = client.post("/api/auth/login", json=payload)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 429


@pytest.mark.parametrize(
    ("endpoint", "payload", "allowed_attempts", "success_status"),
    [
        (
            "/api/auth/register",
            {
                "full_name": "Student Test",
                "email": "student@example.com",
                "password": "ParolaSigura123",
                "accepted_terms": True,
                "newsletter_consent": False,
            },
            5,
            202,
        ),
        (
            "/api/auth/password-reset/request",
            {"email": "student@example.com"},
            5,
            200,
        ),
        (
            "/api/auth/password-reset/confirm",
            {
                "token": "reset-token-with-safe-length",
                "password": "ParolaSigura123",
            },
            10,
            200,
        ),
    ],
)
def test_auth_sensitive_endpoints_rate_limit_repeated_attempts(
    endpoint: str,
    payload: dict[str, object],
    allowed_attempts: int,
    success_status: int,
) -> None:
    service = FakeAuthService()
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            for _ in range(allowed_attempts):
                assert client.post(endpoint, json=payload).status_code == success_status

            response = client.post(endpoint, json=payload)
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 429


def test_login_rate_limit_uses_forwarded_client_ip() -> None:
    service = FakeAuthService()
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            payload = {
                "email": "student@example.com",
                "password": "ParolaSigura123",
            }
            headers = {"x-forwarded-for": "10.0.0.5, 198.51.100.24"}
            for _ in range(10):
                response = client.post(
                    "/api/auth/login",
                    json=payload,
                    headers=headers,
                )
                assert response.status_code == 200

            response = client.post(
                "/api/auth/login",
                json=payload,
                headers=headers,
            )
            other_ip_response = client.post(
                "/api/auth/login",
                json=payload,
                headers={"x-forwarded-for": "10.0.0.5, 203.0.113.9"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 429
    assert other_ip_response.status_code == 200


def test_login_rate_limit_ignores_client_supplied_forwarded_entries() -> None:
    """A spoofed left-hand X-Forwarded-For entry must not open a new bucket."""
    service = FakeAuthService()
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            payload = {
                "email": "student@example.com",
                "password": "ParolaSigura123",
            }
            for attempt in range(10):
                response = client.post(
                    "/api/auth/login",
                    json=payload,
                    headers={"x-forwarded-for": f"10.9.{attempt}.1, 198.51.100.24"},
                )
                assert response.status_code == 200

            response = client.post(
                "/api/auth/login",
                json=payload,
                headers={"x-forwarded-for": "10.9.99.1, 198.51.100.24"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 429


def test_login_rejects_untrusted_origin() -> None:
    service = FakeAuthService()
    settings = get_settings().model_copy(
        update={"cors_origins": "http://localhost:3000"}
    )
    app.dependency_overrides[get_auth_service] = lambda: service
    app.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/auth/login",
                headers={"Origin": "https://evil.example"},
                json={
                    "email": "student@example.com",
                    "password": "ParolaSigura123",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 403


def test_login_truncates_user_agent_before_service() -> None:
    class CapturingAuthService(FakeAuthService):
        user_agent: str | None = None

        async def login(self, *_: object, **kwargs: object) -> AuthResult:
            self.user_agent = kwargs["user_agent"]  # type: ignore[assignment]
            return self._result()

    service = CapturingAuthService()
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/auth/login",
                headers={"User-Agent": "A" * 700},
                json={
                    "email": "student@example.com",
                    "password": "ParolaSigura123",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert service.user_agent is not None
    assert len(service.user_agent) == 512


def test_remember_me_sets_a_persistent_cookie() -> None:
    service = FakeAuthService(persistent=True)
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/auth/login",
                json={
                    "email": "student@example.com",
                    "password": "ParolaSigura123",
                    "remember": True,
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    set_cookie = response.headers["set-cookie"]
    assert "Max-Age" in set_cookie
    assert "expires=" in set_cookie.lower()


def test_me_returns_the_authenticated_user() -> None:
    user = build_user()
    service = FakeAuthService()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.get("/api/auth/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["full_name"] == "Student Test"
    assert response.json()["role"] == "user"
    assert response.json()["theme_preference"] == "system"
    assert response.json()["language_preference"] == "ro"
    assert response.json()["account_deletion_request_pending"] is False


def test_me_returns_pending_account_deletion_request_state() -> None:
    user = build_user()
    service = FakeAuthService(account_deletion_pending=True)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.get("/api/auth/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["account_deletion_request_pending"] is True


def test_me_normalizes_role_padding_from_database() -> None:
    user = build_user()
    user.role = "admin    "
    service = FakeAuthService()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.get("/api/auth/me")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_authenticated_user_can_update_theme_preference() -> None:
    user = build_user()
    service = FakeAuthService()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/api/auth/me/preferences",
                json={"theme_preference": "dark"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["theme_preference"] == "dark"


def test_authenticated_user_can_update_language_preference() -> None:
    user = build_user()
    service = FakeAuthService()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/api/auth/me/preferences",
                json={"language_preference": "fr"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["language_preference"] == "fr"


def test_authenticated_user_can_change_password() -> None:
    class CapturingAuthService(FakeAuthService):
        payload: dict[str, object] | None = None

        async def change_password(self, user: User, **kwargs: object) -> int:
            self.payload = {"user": user, **kwargs}
            return 2

    user = build_user()
    service = CapturingAuthService()
    settings = get_settings().model_copy(
        update={"session_cookie_name": "revizzio_session"}
    )
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service
    app.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/api/auth/me/password",
                cookies={"revizzio_session": "current-session-token"},
                json={
                    "current_password": "ParolaVeche123",
                    "new_password": "ParolaNoua123",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["message"] == (
        "Parola a fost actualizată. Celelalte sesiuni au fost revocate."
    )
    assert service.payload is not None
    assert service.payload["user"] is user
    assert service.payload["current_password"] == "ParolaVeche123"
    assert service.payload["new_password"] == "ParolaNoua123"
    assert service.payload["current_session_token"] == "current-session-token"


def test_change_password_rejects_invalid_current_password() -> None:
    class RejectingAuthService(FakeAuthService):
        async def change_password(self, *_: object, **__: object) -> int:
            raise InvalidCredentialsError

    user = build_user()
    settings = get_settings().model_copy(
        update={"session_cookie_name": "revizzio_session"}
    )
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: RejectingAuthService()
    app.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/api/auth/me/password",
                cookies={"revizzio_session": "current-session-token"},
                json={
                    "current_password": "ParolaGresita123",
                    "new_password": "ParolaNoua123",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401
    assert response.json()["detail"] == "Parola curentă este incorectă."


def test_change_password_rate_limit_blocks_repeated_attempts() -> None:
    user = build_user()
    service = FakeAuthService()
    settings = get_settings().model_copy(
        update={"session_cookie_name": "revizzio_session"}
    )
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service
    app.dependency_overrides[get_settings] = lambda: settings

    try:
        with TestClient(app) as client:
            payload = {
                "current_password": "ParolaVeche123",
                "new_password": "ParolaNoua123",
            }
            for _ in range(8):
                response = client.patch(
                    "/api/auth/me/password",
                    cookies={"revizzio_session": "current-session-token"},
                    json=payload,
                )
                assert response.status_code == 200

            response = client.patch(
                "/api/auth/me/password",
                cookies={"revizzio_session": "current-session-token"},
                json=payload,
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 429


def test_authenticated_user_can_request_account_deletion() -> None:
    class CapturingAuthService(FakeAuthService):
        payload: dict[str, object] | None = None

        async def request_account_deletion(
            self,
            user: User,
            **kwargs: object,
        ) -> None:
            self.payload = {"user": user, **kwargs}

    user = build_user()
    service = CapturingAuthService()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.post("/api/auth/me/deletion-request")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json()["message"] == (
        "Solicitarea de ștergere a contului a fost înregistrată. "
        "Un administrator o va procesa."
    )
    assert service.payload is not None
    assert service.payload["user"] is user


def test_duplicate_account_deletion_request_returns_conflict() -> None:
    class RejectingAuthService(FakeAuthService):
        async def request_account_deletion(
            self,
            *_: object,
            **__: object,
        ) -> None:
            raise AccountDeletionRequestAlreadyPendingError

    user = build_user()
    service = RejectingAuthService()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.post("/api/auth/me/deletion-request")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Ai deja o solicitare de ștergere înregistrată. "
        "Un administrator o va procesa."
    )


def test_account_deletion_request_rate_limit_blocks_repeated_attempts() -> None:
    user = build_user()
    service = FakeAuthService()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            for _ in range(3):
                response = client.post("/api/auth/me/deletion-request")
                assert response.status_code == 202

            response = client.post("/api/auth/me/deletion-request")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 429


def test_theme_preference_rejects_unknown_values() -> None:
    user = build_user()
    service = FakeAuthService()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/api/auth/me/preferences",
                json={"theme_preference": "sepia"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422


def test_language_preference_rejects_unknown_values() -> None:
    user = build_user()
    service = FakeAuthService()
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_auth_service] = lambda: service

    try:
        with TestClient(app) as client:
            response = client.patch(
                "/api/auth/me/preferences",
                json={"language_preference": "de"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422

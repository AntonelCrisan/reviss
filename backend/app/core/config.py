from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    database_url: str
    database_echo: bool = False
    database_pool_size: int = Field(default=5, ge=1, le=50)
    database_max_overflow: int = Field(default=10, ge=0, le=100)

    session_secret: SecretStr
    cron_secret: SecretStr | None = None
    session_cookie_name: str = "revizzio_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    session_cookie_domain: str | None = None
    session_ttl_hours: int = Field(default=24, ge=1, le=168)
    remember_session_ttl_days: int = Field(default=30, ge=1, le=365)
    terms_version: str = "2026-06-11"

    public_app_url: str = "http://localhost:3000"
    email_logo_url: str | None = None
    resend_api_key: SecretStr | None = None
    resend_from_email: str = "Reviss <noreply@reviss.app>"
    email_verification_ttl_minutes: int = Field(default=30, ge=5, le=1440)
    password_reset_ttl_minutes: int = Field(default=30, ge=5, le=1440)
    redis_url: str | None = None
    rate_limit_redis_required: bool = False
    recaptcha_secret_key: SecretStr | None = None
    recaptcha_verify_url: str = "https://www.google.com/recaptcha/api/siteverify"
    contact_rate_limit_window_seconds: int = Field(default=600, ge=60, le=86400)
    contact_rate_limit_max_requests: int = Field(default=5, ge=1, le=100)
    content_report_rate_limit_window_seconds: int = Field(
        default=600,
        ge=60,
        le=86400,
    )
    content_report_rate_limit_max_requests: int = Field(default=5, ge=1, le=100)
    content_report_storage_dir: Path = BACKEND_DIR / "storage" / "content-reports"
    content_report_attachment_max_files: int = Field(default=5, ge=0, le=10)
    content_report_attachment_max_mb: int = Field(default=10, ge=1, le=25)

    stripe_secret_key: SecretStr | None = None
    stripe_webhook_secret: SecretStr | None = None
    stripe_api_base_url: str = "https://api.stripe.com/v1"
    stripe_checkout_success_path: str = (
        "/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}"
    )
    stripe_checkout_cancel_path: str = "/upgrade?checkout=cancelled"

    project_storage_dir: Path = BACKEND_DIR / "storage" / "projects"
    project_upload_max_mb: int = Field(default=50, ge=1, le=250)

    mistral_api_key: SecretStr | None = None
    mistral_ocr_api_url: str = "https://api.mistral.ai/v1/ocr"
    mistral_ocr_model: str = "mistral-ocr-latest"
    mistral_ocr_timeout_seconds: int = Field(default=120, ge=10, le=600)

    google_client_id: str | None = None
    google_client_secret: SecretStr | None = None

    openai_api_key: SecretStr | None = None
    openai_study_model: str = "gpt-5.6-luna"
    openai_quiz_model: str = "gpt-5.6-terra"
    openai_request_timeout_seconds: int = Field(default=600, ge=30, le=1800)
    openai_quiz_request_timeout_seconds: int = Field(default=900, ge=60, le=1800)
    openai_max_input_chars: int = Field(default=1_000_000, ge=20_000, le=2_000_000)
    # Generating one study pack opens up to 14 calls at once, so a handful of
    # students together can run into the account's tokens-per-minute limit.
    # Only bulk generation queues here; chat and explanations never wait.
    openai_max_parallel_generations: int = Field(default=12, ge=1, le=64)

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if value.startswith("postgres://"):
            value = value.replace("postgres://", "postgresql+asyncpg://", 1)
        elif value.startswith("postgresql://"):
            value = value.replace("postgresql://", "postgresql+asyncpg://", 1)

        if not value.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "DATABASE_URL must use PostgreSQL."
            )

        try:
            url = make_url(value)
            port = url.port
        except (ArgumentError, ValueError) as exc:
            raise ValueError("DATABASE_URL is not a valid database URL.") from exc

        if not url.username or not url.host or not url.database:
            raise ValueError(
                "DATABASE_URL must include a username, host and database name."
            )
        if "@" in url.host:
            raise ValueError(
                "DATABASE_URL contains an unescaped '@' in the password. "
                "Use '%40' instead."
            )
        if port is None:
            raise ValueError("DATABASE_URL must include the PostgreSQL port.")

        return value

    @field_validator("session_secret")
    @classmethod
    def validate_session_secret(cls, value: SecretStr) -> SecretStr:
        if len(value.get_secret_value()) < 32:
            raise ValueError("SESSION_SECRET must contain at least 32 characters.")
        return value

    @field_validator("session_cookie_domain", mode="before")
    @classmethod
    def empty_cookie_domain_is_none(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("public_app_url")
    @classmethod
    def normalize_public_app_url(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("email_logo_url", mode="before")
    @classmethod
    def empty_email_logo_url_is_none(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("redis_url", mode="before")
    @classmethod
    def empty_redis_url_is_none(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("mistral_api_key", mode="before")
    @classmethod
    def empty_mistral_api_key_is_none(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("google_client_id", mode="before")
    @classmethod
    def empty_google_client_id_is_none(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("google_client_secret", mode="before")
    @classmethod
    def empty_google_client_secret_is_none(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("mistral_ocr_api_url")
    @classmethod
    def validate_mistral_ocr_api_url(cls, value: str) -> str:
        ocr_url = value.strip().rstrip("/")
        if not ocr_url.startswith("https://"):
            raise ValueError("MISTRAL_OCR_API_URL must use HTTPS.")
        return ocr_url

    @field_validator("mistral_ocr_model")
    @classmethod
    def validate_mistral_ocr_model(cls, value: str) -> str:
        model = value.strip()
        if not model:
            raise ValueError("MISTRAL_OCR_MODEL must not be empty.")
        return model

    @field_validator("recaptcha_secret_key", mode="before")
    @classmethod
    def empty_recaptcha_secret_key_is_none(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("recaptcha_verify_url")
    @classmethod
    def validate_recaptcha_verify_url(cls, value: str) -> str:
        verify_url = value.strip()
        if not verify_url.startswith("https://"):
            raise ValueError("RECAPTCHA_VERIFY_URL must use HTTPS.")
        return verify_url

    @field_validator("resend_from_email")
    @classmethod
    def validate_resend_from_email(cls, value: str) -> str:
        sender = value.strip()
        if not sender:
            raise ValueError("RESEND_FROM_EMAIL must not be empty.")

        sender_email = sender
        if "<" in sender or ">" in sender:
            if "<" not in sender or ">" not in sender:
                raise ValueError(
                    "RESEND_FROM_EMAIL must be a plain email or Name <email>."
                )
            sender_email = sender.rsplit("<", 1)[1].split(">", 1)[0].strip()

        if "@" not in sender_email or sender_email.startswith("@"):
            raise ValueError("RESEND_FROM_EMAIL must contain a valid email address.")
        if sender_email.lower().endswith("@resend.dev"):
            raise ValueError(
                "RESEND_FROM_EMAIL must use a verified sender domain."
            )

        return sender

    @field_validator("project_storage_dir", mode="before")
    @classmethod
    def normalize_project_storage_dir(cls, value: object) -> Path:
        if value is None or value == "":
            return BACKEND_DIR / "storage" / "projects"
        path = Path(str(value))
        return path if path.is_absolute() else BACKEND_DIR / path

    @field_validator("content_report_storage_dir", mode="before")
    @classmethod
    def normalize_content_report_storage_dir(cls, value: object) -> Path:
        if value is None or value == "":
            return BACKEND_DIR / "storage" / "content-reports"
        path = Path(str(value))
        return path if path.is_absolute() else BACKEND_DIR / path

    @model_validator(mode="after")
    def validate_session_cookie_security(self) -> Settings:
        if self.session_cookie_samesite == "none" and not self.session_cookie_secure:
            raise ValueError(
                "SESSION_COOKIE_SECURE must be true when "
                "SESSION_COOKIE_SAMESITE is none."
            )
        if self.environment == "production":
            if not self.session_cookie_secure:
                raise ValueError("SESSION_COOKIE_SECURE must be true in production.")
            if not self.public_app_url.startswith("https://"):
                raise ValueError("PUBLIC_APP_URL must use HTTPS in production.")
            if self.email_logo_url and not self.email_logo_url.startswith("https://"):
                raise ValueError("EMAIL_LOGO_URL must use HTTPS in production.")
            if (
                self.session_secret.get_secret_value()
                == "replace-with-at-least-32-random-characters"
            ):
                raise ValueError("SESSION_SECRET must be changed in production.")
        return self

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()

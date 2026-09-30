import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator

ThemePreference = Literal["light", "dark", "system"]
LanguagePreference = Literal["ro", "en", "fr"]
UserRole = Literal["admin", "user"]


class UserPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    price_ron: Decimal
    billing_interval: str
    badge: str | None
    material_limit: str
    ai_level: str
    storage: str
    conditions: str
    active_project_limit: int
    monthly_material_limit: int
    files_per_project_limit: int
    file_size_limit_mb: int
    project_size_limit_mb: int
    estimated_page_limit: int
    initial_flashcard_limit: int
    quiz_questions_per_quiz: int
    quizzes_per_project_limit: int
    allow_scanned_documents: bool
    monthly_page_limit: int
    ai_chat_enabled: bool
    is_featured: bool


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    is_active: bool
    role: UserRole
    created_at: datetime
    theme_preference: ThemePreference
    language_preference: LanguagePreference
    # Null means the account still shows its initials. When set, it doubles as
    # the version that makes a newly uploaded picture replace the cached one.
    avatar_updated_at: datetime | None = None
    current_plan: UserPlanResponse | None = None
    account_deletion_request_pending: bool = False

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class UserPreferencesUpdate(BaseModel):
    theme_preference: ThemePreference | None = None
    language_preference: LanguagePreference | None = None

    @model_validator(mode="after")
    def at_least_one_preference(self) -> UserPreferencesUpdate:
        if self.theme_preference is None and self.language_preference is None:
            raise ValueError("Trimite cel putin o preferinta de actualizat.")
        return self

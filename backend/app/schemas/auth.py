from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

PASSWORD_MIN_LENGTH = 10
COMMON_PASSWORDS = {
    "1234567890",
    "password123",
    "parola1234",
    "qwerty1234",
    "reviss1234",
    "revizzio1234",
}


def validate_secure_password(value: str) -> str:
    if value != value.strip():
        raise ValueError("Parola nu poate incepe sau termina cu spatii.")
    if value.lower() in COMMON_PASSWORDS:
        raise ValueError("Alege o parola mai greu de ghicit.")
    if not any(character.isalpha() for character in value):
        raise ValueError("Parola trebuie sa contina cel putin o litera.")
    if not any(character.isdigit() for character in value):
        raise ValueError("Parola trebuie sa contina cel putin o cifra.")
    return value


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=128)
    accepted_terms: bool
    newsletter_consent: bool = False

    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("Numele complet este obligatoriu.")
        return normalized

    @field_validator("password")
    @classmethod
    def password_must_be_secure(cls, value: str) -> str:
        return validate_secure_password(value)

    @field_validator("accepted_terms")
    @classmethod
    def terms_must_be_accepted(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Trebuie să accepți termenii platformei.")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    remember: bool = False


class EmailVerificationRequest(BaseModel):
    token: str = Field(min_length=20, max_length=256)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=128)

    @field_validator("password")
    @classmethod
    def password_must_be_secure(cls, value: str) -> str:
        return validate_secure_password(value)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=128)

    @field_validator("new_password")
    @classmethod
    def new_password_must_be_secure(cls, value: str) -> str:
        return validate_secure_password(value)

    @model_validator(mode="after")
    def new_password_must_be_different(self) -> ChangePasswordRequest:
        if self.current_password == self.new_password:
            raise ValueError("Parola nouă trebuie să fie diferită de parola curentă.")
        return self


class UpdateFullNameRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)

    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("Numele complet este obligatoriu.")
        return normalized


class RequestEmailChangeRequest(BaseModel):
    new_email: EmailStr
    current_password: str = Field(min_length=1, max_length=128)


class ConfirmEmailChangeRequest(BaseModel):
    token: str = Field(min_length=20, max_length=256)


class GoogleCallbackRequest(BaseModel):
    code: str = Field(min_length=1, max_length=2048)


class MessageResponse(BaseModel):
    message: str


class UnsubscribeResponse(BaseModel):
    unsubscribed: bool

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from anyio import to_thread
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.i18n import get_request_language, language_for_user, t
from app.core.security import (
    dummy_password_hash,
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)
from app.models import (
    AccountDeletionRequest,
    PasswordResetToken,
    PendingEmailChange,
    PendingRegistration,
    StudyProject,
    StudyProjectFile,
    StudyProjectFlashcard,
    User,
)
from app.repositories.auth import AuthSessionRepository, UserRepository
from app.schemas.auth import LoginRequest, PasswordResetRequest, RegisterRequest
from app.schemas.user import LanguagePreference, ThemePreference
from app.services.audit import add_audit_log
from app.services.email import (
    EmailDeliveryError,
    EmailMessage,
    EmailService,
    email_change_confirmation_email,
    email_logo_html,
    password_reset_email,
    verification_email,
)
from app.services.google_oauth import exchange_code_for_identity


class EmailAlreadyRegisteredError(Exception):
    pass


class EmailDeliveryUnavailableError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class InvalidEmailTokenError(Exception):
    pass


class PendingEmailConfirmationError(Exception):
    pass


class InvalidSessionError(Exception):
    pass


class AccountDeletionRequestAlreadyPendingError(Exception):
    pass


class EmailUnchangedError(Exception):
    pass


def _normalize_email(email: str) -> str:
    return email.strip().lower()


@dataclass(frozen=True)
class AuthResult:
    user: User
    session_token: str
    expires_at: datetime
    persistent: bool


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self._session = session
        self._settings = settings
        self._users = UserRepository(session)
        self._sessions = AuthSessionRepository(session)
        self._email = EmailService(settings)

    async def register(
        self,
        payload: RegisterRequest,
        *,
        user_agent: str | None,
        ip_address: str | None,
    ) -> None:
        email = _normalize_email(str(payload.email))
        if await self._users.get_by_email(email) is not None:
            add_audit_log(
                self._session,
                action="auth.register_failed",
                status="failure",
                actor_email=email,
                resource_type="user",
                details={"email": email, "reason": "email_already_registered"},
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._session.commit()
            raise EmailAlreadyRegisteredError

        password_hash = await to_thread.run_sync(hash_password, payload.password)
        token = generate_session_token()
        token_hash = self._hash_token(token)
        now = datetime.now(UTC)
        expires_at = now + timedelta(
            minutes=self._settings.email_verification_ttl_minutes
        )

        pending = await self._session.scalar(
            select(PendingRegistration).where(PendingRegistration.email == email)
        )
        if pending is None:
            pending = PendingRegistration(email=email)
            self._session.add(pending)

        pending.full_name = payload.full_name
        pending.password_hash = password_hash
        pending.token_hash = token_hash
        pending.accepted_terms = payload.accepted_terms
        pending.terms_version = self._settings.terms_version
        pending.newsletter_consent = payload.newsletter_consent
        pending.expires_at = expires_at
        pending.used_at = None
        pending.updated_at = now

        add_audit_log(
            self._session,
            action="auth.registration_verification_requested",
            actor_email=email,
            resource_type="pending_registration",
            details={
                "email": email,
                "newsletter_consent": payload.newsletter_consent,
                "expires_at": expires_at,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )

        await self._session.flush()

        # No account yet: the language is the one the visitor registers in.
        language = get_request_language()
        html, text = verification_email(
            verification_url=self._verification_url(token),
            logo_html=self._email_logo_html(),
            language=language,
        )
        try:
            await self._email.send(
                EmailMessage(
                    to=email,
                    subject=t("email.verification.subject", language),
                    html=html,
                    text=text,
                )
            )
            await self._session.commit()
        except EmailDeliveryError as exc:
            await self._session.rollback()
            await self._audit_email_failure(
                action="auth.registration_email_failed",
                email=email,
                details={"reason": str(exc)},
                ip_address=ip_address,
                user_agent=user_agent,
            )
            raise EmailDeliveryUnavailableError from exc

    async def verify_email(
        self,
        token: str,
        *,
        user_agent: str | None,
        ip_address: str | None,
    ) -> AuthResult:
        now = datetime.now(UTC)
        pending = await self._session.scalar(
            select(PendingRegistration).where(
                PendingRegistration.token_hash == self._hash_token(token),
                PendingRegistration.used_at.is_(None),
                PendingRegistration.expires_at > now,
            )
        )
        if pending is None:
            raise InvalidEmailTokenError

        existing_user = await self._users.get_by_email(pending.email)
        if existing_user is not None:
            if existing_user.is_active:
                pending.used_at = now
                await self._session.commit()
                raise EmailAlreadyRegisteredError

            existing_user.is_active = True
            pending.used_at = now
            result = await self._create_session(
                user=existing_user,
                persistent=False,
                user_agent=user_agent,
                ip_address=ip_address,
            )
            add_audit_log(
                self._session,
                action="auth.email_verified_existing_user",
                actor=existing_user,
                resource_type="user",
                resource_id=str(existing_user.id),
                details={"email": existing_user.email},
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._session.commit()
            return result

        try:
            user = await self._users.add(
                full_name=pending.full_name,
                email=pending.email,
                password_hash=pending.password_hash,
                terms_accepted_at=now,
                terms_version=pending.terms_version,
                newsletter_consent=pending.newsletter_consent,
                newsletter_consent_at=now if pending.newsletter_consent else None,
            )
            pending.used_at = now
            result = await self._create_session(
                user=user,
                persistent=False,
                user_agent=user_agent,
                ip_address=ip_address,
            )
            add_audit_log(
                self._session,
                action="auth.email_verified_and_registered",
                actor=user,
                resource_type="user",
                resource_id=str(user.id),
                details={
                    "email": user.email,
                    "newsletter_consent": user.newsletter_consent,
                    "terms_version": user.terms_version,
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._session.commit()
            return result
        except IntegrityError as exc:
            await self._session.rollback()
            raise EmailAlreadyRegisteredError from exc

    async def login(
        self,
        payload: LoginRequest,
        *,
        user_agent: str | None,
        ip_address: str | None,
    ) -> AuthResult:
        email = _normalize_email(str(payload.email))
        user = await self._users.get_by_email(email)
        password_hash = (
            user.password_hash if user is not None and user.password_hash else None
        )
        password_is_valid = await to_thread.run_sync(
            verify_password,
            payload.password,
            password_hash or dummy_password_hash,
        )
        if user is None:
            await self._raise_pending_confirmation_if_credentials_match(
                email=email,
                password=payload.password,
                ip_address=ip_address,
                user_agent=user_agent,
            )

        if user is None or not user.is_active or not password_is_valid:
            add_audit_log(
                self._session,
                action="auth.login_failed",
                status="failure",
                actor=user,
                actor_email=email,
                resource_type="user",
                resource_id=str(user.id) if user is not None else None,
                details={
                    "email": email,
                    "reason": "invalid_credentials_or_inactive_user",
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._session.commit()
            raise InvalidCredentialsError

        result = await self._create_session(
            user=user,
            persistent=payload.remember,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        add_audit_log(
            self._session,
            action="auth.logged_in",
            actor=user,
            resource_type="user",
            resource_id=str(user.id),
            details={"remember_session": payload.remember},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()
        return result

    async def login_with_google(
        self,
        code: str,
        *,
        user_agent: str | None,
        ip_address: str | None,
    ) -> AuthResult:
        identity = await exchange_code_for_identity(code, settings=self._settings)
        now = datetime.now(UTC)

        user = await self._users.get_by_google_sub(identity.sub)
        if user is None:
            user = await self._users.get_by_email(identity.email)
            if user is not None:
                user.google_sub = identity.sub
                was_inactive = not user.is_active
                if was_inactive:
                    user.is_active = True
                add_audit_log(
                    self._session,
                    action="auth.google_account_linked",
                    actor=user,
                    resource_type="user",
                    resource_id=str(user.id),
                    details={"email": user.email, "activated": was_inactive},
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            else:
                try:
                    user = await self._users.add_from_google(
                        full_name=identity.full_name,
                        email=identity.email,
                        google_sub=identity.sub,
                        terms_accepted_at=now,
                        terms_version=self._settings.terms_version,
                    )
                except IntegrityError as exc:
                    await self._session.rollback()
                    raise EmailAlreadyRegisteredError from exc
                add_audit_log(
                    self._session,
                    action="auth.registered_via_google",
                    actor=user,
                    resource_type="user",
                    resource_id=str(user.id),
                    details={"email": user.email},
                    ip_address=ip_address,
                    user_agent=user_agent,
                )

        result = await self._create_session(
            user=user,
            persistent=True,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        add_audit_log(
            self._session,
            action="auth.logged_in",
            actor=user,
            resource_type="user",
            resource_id=str(user.id),
            details={"provider": "google"},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()
        return result

    async def request_password_reset(
        self,
        payload: PasswordResetRequest,
        *,
        user_agent: str | None,
        ip_address: str | None,
    ) -> None:
        email = _normalize_email(str(payload.email))
        user = await self._users.get_by_email(email)
        if user is None or not user.is_active:
            add_audit_log(
                self._session,
                action="auth.password_reset_requested_ignored",
                actor_email=email,
                resource_type="user",
                details={"email": email, "reason": "user_not_found_or_inactive"},
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._session.commit()
            return

        now = datetime.now(UTC)
        active_reset_token = await self._session.scalar(
            select(PasswordResetToken)
            .where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > now,
            )
            .order_by(PasswordResetToken.created_at.desc())
        )
        if active_reset_token is not None:
            add_audit_log(
                self._session,
                action="auth.password_reset_request_ignored_active_token",
                actor=user,
                resource_type="password_reset_token",
                resource_id=str(active_reset_token.id),
                details={
                    "email": email,
                    "expires_at": active_reset_token.expires_at,
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._session.commit()
            return

        token = generate_session_token()
        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=self._hash_token(token),
            expires_at=now
            + timedelta(minutes=self._settings.password_reset_ttl_minutes),
        )
        self._session.add(reset_token)
        actor_user_id = user.id
        actor_email = user.email
        actor_name = user.full_name
        add_audit_log(
            self._session,
            action="auth.password_reset_requested",
            actor=user,
            resource_type="user",
            resource_id=str(user.id),
            details={"email": email, "expires_at": reset_token.expires_at},
            ip_address=ip_address,
            user_agent=user_agent,
        )

        await self._session.flush()

        language = language_for_user(user.language_preference)
        html, text = password_reset_email(
            reset_url=self._password_reset_url(token),
            logo_html=self._email_logo_html(),
            language=language,
        )
        try:
            await self._email.send(
                EmailMessage(
                    to=email,
                    subject=t("email.password_reset.subject", language),
                    html=html,
                    text=text,
                )
            )
            await self._session.commit()
        except EmailDeliveryError as exc:
            await self._session.rollback()
            await self._audit_email_failure(
                action="auth.password_reset_email_failed",
                actor_user_id=actor_user_id,
                email=email,
                actor_name=actor_name,
                actor_email=actor_email,
                details={"reason": str(exc)},
                ip_address=ip_address,
                user_agent=user_agent,
            )
            return

    async def reset_password(
        self,
        *,
        token: str,
        password: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> None:
        now = datetime.now(UTC)
        token_hash = self._hash_token(token)
        reset_token = await self._session.scalar(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > now,
            )
        )
        if reset_token is None:
            raise InvalidEmailTokenError

        user = await self._session.get(User, reset_token.user_id)
        if user is None or not user.is_active:
            raise InvalidEmailTokenError

        user.password_hash = await to_thread.run_sync(hash_password, password)
        user.updated_at = now
        reset_token.used_at = now
        revoked_sessions = await self._sessions.revoke_all_for_user(
            user_id=user.id,
            revoked_at=now,
        )
        add_audit_log(
            self._session,
            action="auth.password_reset_completed",
            actor=user,
            resource_type="user",
            resource_id=str(user.id),
            details={"revoked_sessions": revoked_sessions},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()

    async def change_password(
        self,
        user: User,
        *,
        current_password: str,
        new_password: str,
        current_session_token: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> int:
        password_is_valid = await to_thread.run_sync(
            verify_password,
            current_password,
            user.password_hash or dummy_password_hash,
        )
        if not password_is_valid:
            add_audit_log(
                self._session,
                action="auth.password_change_failed",
                status="failure",
                actor=user,
                resource_type="user",
                resource_id=str(user.id),
                details={"reason": "invalid_current_password"},
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._session.commit()
            raise InvalidCredentialsError

        now = datetime.now(UTC)
        user.password_hash = await to_thread.run_sync(hash_password, new_password)
        user.updated_at = now
        revoked_sessions = await self._sessions.revoke_all_for_user_except_token_hash(
            user_id=user.id,
            token_hash=self._hash_token(current_session_token),
            revoked_at=now,
        )
        add_audit_log(
            self._session,
            action="auth.password_changed",
            actor=user,
            resource_type="user",
            resource_id=str(user.id),
            details={"revoked_sessions": revoked_sessions},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()
        return revoked_sessions

    async def request_account_deletion(
        self,
        user: User,
        *,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> AccountDeletionRequest:
        existing_request = await self._pending_account_deletion_request(user.id)
        if existing_request is not None:
            raise AccountDeletionRequestAlreadyPendingError

        deletion_request = AccountDeletionRequest(
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            status="pending",
            ip_address=ip_address,
            user_agent=user_agent,
        )
        try:
            self._session.add(deletion_request)
            await self._session.flush()
            add_audit_log(
                self._session,
                action="account.deletion_requested",
                actor=user,
                resource_type="account_deletion_request",
                resource_id=str(deletion_request.id),
                details={"email": user.email, "full_name": user.full_name},
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._session.commit()
        except IntegrityError as exc:
            await self._session.rollback()
            existing_request = await self._pending_account_deletion_request(user.id)
            if existing_request is not None:
                raise AccountDeletionRequestAlreadyPendingError from exc
            raise

        return deletion_request

    async def has_pending_account_deletion_request(self, user: User) -> bool:
        return await self._pending_account_deletion_request(user.id) is not None

    async def _pending_account_deletion_request(
        self,
        user_id: UUID,
    ) -> AccountDeletionRequest | None:
        return await self._session.scalar(
            select(AccountDeletionRequest)
            .where(
                AccountDeletionRequest.user_id == user_id,
                AccountDeletionRequest.status == "pending",
            )
            .order_by(AccountDeletionRequest.created_at.desc())
        )

    async def get_user_by_session_token(self, token: str) -> User:
        auth_session = await self._sessions.get_active_by_token_hash(
            token_hash=self._hash_token(token),
            now=datetime.now(UTC),
        )
        if auth_session is None or not auth_session.user.is_active:
            raise InvalidSessionError
        return auth_session.user

    async def logout(
        self,
        token: str | None,
        *,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> None:
        if token is None:
            return
        auth_session = await self._sessions.revoke(
            token_hash=self._hash_token(token),
            revoked_at=datetime.now(UTC),
        )
        add_audit_log(
            self._session,
            action=(
                "auth.logged_out"
                if auth_session is not None
                else "auth.logout_failed"
            ),
            status="success" if auth_session is not None else "failure",
            actor_user_id=auth_session.user_id if auth_session is not None else None,
            resource_type="auth_session",
            resource_id=str(auth_session.id) if auth_session is not None else None,
            details={
                "reason": "session_revoked"
                if auth_session is not None
                else "session_not_found",
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()

    async def update_preferences(
        self,
        user: User,
        *,
        theme_preference: ThemePreference | None = None,
        language_preference: LanguagePreference | None = None,
    ) -> User:
        old_theme_preference = user.theme_preference
        old_language_preference = user.language_preference
        updated_user = await self._users.update_preferences(
            user,
            theme_preference=theme_preference,
            language_preference=language_preference,
        )
        add_audit_log(
            self._session,
            action="user.preferences.updated",
            actor=updated_user,
            resource_type="user",
            resource_id=str(updated_user.id),
            details={
                "theme_preference": theme_preference,
                "language_preference": language_preference,
                "previous_theme_preference": old_theme_preference,
                "previous_language_preference": old_language_preference,
            },
        )
        await self._session.commit()
        return updated_user

    async def withdraw_newsletter_consent(self, user: User) -> User:
        if not user.newsletter_consent:
            return user

        user.newsletter_consent = False
        add_audit_log(
            self._session,
            action="user.newsletter_consent_withdrawn",
            actor=user,
            resource_type="user",
            resource_id=str(user.id),
            details={},
        )
        await self._session.commit()
        return user

    async def export_account_data(self, user: User) -> dict[str, object]:
        projects = list(
            (
                await self._session.scalars(
                    select(StudyProject)
                    .options(
                        selectinload(StudyProject.files),
                        selectinload(StudyProject.flashcards),
                        selectinload(StudyProject.archive),
                    )
                    .where(StudyProject.user_id == user.id)
                    .order_by(StudyProject.created_at.desc())
                )
            ).all()
        )

        def _file_payload(file: StudyProjectFile) -> dict[str, object]:
            return {
                "id": str(file.id),
                "original_filename": file.original_filename,
                "content_type": file.content_type,
                "size_bytes": file.size_bytes,
                "conversion_status": file.conversion_status,
                "created_at": file.created_at.isoformat(),
            }

        def _flashcard_payload(flashcard: StudyProjectFlashcard) -> dict[str, object]:
            return {
                "id": str(flashcard.id),
                "front": flashcard.front,
                "back": flashcard.back,
                "category": flashcard.category,
                "difficulty": flashcard.difficulty,
                "source_type": flashcard.source_type,
            }

        def _project_payload(project: StudyProject) -> dict[str, object]:
            return {
                "id": str(project.id),
                "name": project.name,
                "subject_name": project.subject_name,
                "institution_name": project.institution_name,
                "status": project.status,
                "is_archived": project.archive is not None,
                "created_at": project.created_at.isoformat(),
                "updated_at": project.updated_at.isoformat(),
                "materials": [_file_payload(file) for file in project.files],
                "flashcards": [
                    _flashcard_payload(flashcard) for flashcard in project.flashcards
                ],
            }

        add_audit_log(
            self._session,
            action="user.data_export_requested",
            actor=user,
            resource_type="user",
            resource_id=str(user.id),
            details={"project_count": len(projects)},
        )
        await self._session.commit()

        return {
            "generated_at": datetime.now(UTC).isoformat(),
            "account": {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role,
                "created_at": user.created_at.isoformat(),
                "theme_preference": user.theme_preference,
                "language_preference": user.language_preference,
                "terms_accepted_at": user.terms_accepted_at.isoformat(),
                "terms_version": user.terms_version,
                "newsletter_consent": user.newsletter_consent,
                "newsletter_consent_at": (
                    user.newsletter_consent_at.isoformat()
                    if user.newsletter_consent_at
                    else None
                ),
            },
            "projects": [_project_payload(project) for project in projects],
        }

    async def update_full_name(
        self,
        user: User,
        *,
        full_name: str,
    ) -> User:
        old_full_name = user.full_name
        updated_user = await self._users.update_full_name(user, full_name=full_name)
        add_audit_log(
            self._session,
            action="user.full_name.updated",
            actor=updated_user,
            resource_type="user",
            resource_id=str(updated_user.id),
            details={"previous_full_name": old_full_name, "full_name": full_name},
        )
        await self._session.commit()
        return updated_user

    async def request_email_change(
        self,
        user: User,
        *,
        new_email: str,
        current_password: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> None:
        password_is_valid = await to_thread.run_sync(
            verify_password,
            current_password,
            user.password_hash or dummy_password_hash,
        )
        if not password_is_valid:
            add_audit_log(
                self._session,
                action="auth.email_change_failed",
                status="failure",
                actor=user,
                resource_type="user",
                resource_id=str(user.id),
                details={"reason": "invalid_current_password"},
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._session.commit()
            raise InvalidCredentialsError

        normalized_email = _normalize_email(new_email)
        if normalized_email == user.email:
            raise EmailUnchangedError

        existing_user = await self._users.get_by_email(normalized_email)
        if existing_user is not None:
            add_audit_log(
                self._session,
                action="auth.email_change_failed",
                status="failure",
                actor=user,
                resource_type="user",
                resource_id=str(user.id),
                details={
                    "reason": "email_already_registered",
                    "new_email": normalized_email,
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await self._session.commit()
            raise EmailAlreadyRegisteredError

        now = datetime.now(UTC)
        previous_pending = list(
            (
                await self._session.scalars(
                    select(PendingEmailChange).where(
                        PendingEmailChange.user_id == user.id,
                        PendingEmailChange.used_at.is_(None),
                    )
                )
            ).all()
        )
        for pending in previous_pending:
            pending.used_at = now

        token = generate_session_token()
        pending_change = PendingEmailChange(
            user_id=user.id,
            new_email=normalized_email,
            token_hash=self._hash_token(token),
            expires_at=now
            + timedelta(minutes=self._settings.email_verification_ttl_minutes),
        )
        self._session.add(pending_change)
        add_audit_log(
            self._session,
            action="auth.email_change_requested",
            actor=user,
            resource_type="user",
            resource_id=str(user.id),
            details={
                "new_email": normalized_email,
                "expires_at": pending_change.expires_at,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.flush()

        language = language_for_user(user.language_preference)
        html, text = email_change_confirmation_email(
            confirmation_url=self._email_change_confirmation_url(token),
            logo_html=self._email_logo_html(),
            new_email=normalized_email,
            language=language,
        )
        try:
            await self._email.send(
                EmailMessage(
                    to=normalized_email,
                    subject=t("email.email_change.subject", language),
                    html=html,
                    text=text,
                )
            )
            await self._session.commit()
        except EmailDeliveryError as exc:
            await self._session.rollback()
            await self._audit_email_failure(
                action="auth.email_change_email_failed",
                actor_user_id=user.id,
                actor_email=user.email,
                actor_name=user.full_name,
                email=normalized_email,
                details={"reason": str(exc)},
                ip_address=ip_address,
                user_agent=user_agent,
            )
            raise EmailDeliveryUnavailableError from exc

    async def confirm_email_change(
        self,
        token: str,
        *,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> User:
        now = datetime.now(UTC)
        pending = await self._session.scalar(
            select(PendingEmailChange).where(
                PendingEmailChange.token_hash == self._hash_token(token),
                PendingEmailChange.used_at.is_(None),
                PendingEmailChange.expires_at > now,
            )
        )
        if pending is None:
            raise InvalidEmailTokenError

        user = await self._session.get(User, pending.user_id)
        if user is None:
            raise InvalidEmailTokenError

        existing_user = await self._users.get_by_email(pending.new_email)
        if existing_user is not None and existing_user.id != user.id:
            pending.used_at = now
            await self._session.commit()
            raise EmailAlreadyRegisteredError

        old_email = user.email
        user.email = pending.new_email
        pending.used_at = now
        add_audit_log(
            self._session,
            action="auth.email_changed",
            actor=user,
            resource_type="user",
            resource_id=str(user.id),
            details={"previous_email": old_email, "new_email": user.email},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        try:
            await self._session.commit()
        except IntegrityError as exc:
            await self._session.rollback()
            raise EmailAlreadyRegisteredError from exc
        return user

    async def _raise_pending_confirmation_if_credentials_match(
        self,
        *,
        email: str,
        password: str,
        ip_address: str | None,
        user_agent: str | None,
    ) -> None:
        now = datetime.now(UTC)
        pending = await self._session.scalar(
            select(PendingRegistration).where(
                PendingRegistration.email == email,
                PendingRegistration.used_at.is_(None),
                PendingRegistration.expires_at > now,
            )
        )
        if pending is None:
            return

        password_matches_pending = await to_thread.run_sync(
            verify_password,
            password,
            pending.password_hash,
        )
        if not password_matches_pending:
            return

        add_audit_log(
            self._session,
            action="auth.login_blocked_pending_email_confirmation",
            status="failure",
            actor_email=email,
            resource_type="pending_registration",
            resource_id=str(pending.id),
            details={"email": email, "expires_at": pending.expires_at},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()
        raise PendingEmailConfirmationError

    async def _audit_email_failure(
        self,
        *,
        action: str,
        email: str,
        details: dict[str, object],
        actor_user_id: UUID | None = None,
        actor_email: str | None = None,
        actor_name: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        add_audit_log(
            self._session,
            action=action,
            status="failure",
            actor_user_id=actor_user_id,
            actor_email=actor_email or email,
            actor_name=actor_name,
            resource_type="email",
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await self._session.commit()

    async def _create_session(
        self,
        *,
        user: User,
        persistent: bool,
        user_agent: str | None,
        ip_address: str | None,
    ) -> AuthResult:
        now = datetime.now(UTC)
        lifetime = (
            timedelta(days=self._settings.remember_session_ttl_days)
            if persistent
            else timedelta(hours=self._settings.session_ttl_hours)
        )
        expires_at = now + lifetime
        session_token = generate_session_token()

        await self._sessions.add(
            user_id=user.id,
            token_hash=self._hash_token(session_token),
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        return AuthResult(
            user=user,
            session_token=session_token,
            expires_at=expires_at,
            persistent=persistent,
        )

    def _verification_url(self, token: str) -> str:
        return f"{self._settings.public_app_url}/verify-email?token={token}"

    def _password_reset_url(self, token: str) -> str:
        return f"{self._settings.public_app_url}/reset-password?token={token}"

    def _email_change_confirmation_url(self, token: str) -> str:
        return f"{self._settings.public_app_url}/confirm-email-change?token={token}"

    def _email_logo_html(self) -> str:
        return email_logo_html(self._settings.email_logo_url, app_name="Reviss")

    def _hash_token(self, token: str) -> str:
        return hash_session_token(
            token,
            self._settings.session_secret.get_secret_value(),
        )

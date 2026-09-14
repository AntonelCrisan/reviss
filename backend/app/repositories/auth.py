import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import FREE_PLAN_SLUG, AuthSession, SubscriptionPlan, User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_email(self, email: str) -> User | None:
        return await self._session.scalar(
            select(User)
            .options(selectinload(User.current_plan))
            .where(User.email == email)
        )

    async def get_by_google_sub(self, google_sub: str) -> User | None:
        return await self._session.scalar(
            select(User)
            .options(selectinload(User.current_plan))
            .where(User.google_sub == google_sub)
        )

    async def _free_plan(self) -> SubscriptionPlan | None:
        """The plan a brand-new account starts on.

        Assigned as the relationship, not just the id: the caller keeps using
        the freshly created user in the same request, and a lazy load of
        ``current_plan`` there would blow up under async SQLAlchemy.
        """
        return await self._session.scalar(
            select(SubscriptionPlan).where(SubscriptionPlan.slug == FREE_PLAN_SLUG)
        )

    async def add(
        self,
        *,
        full_name: str,
        email: str,
        password_hash: str,
        terms_accepted_at: datetime,
        terms_version: str,
        newsletter_consent: bool,
        newsletter_consent_at: datetime | None,
    ) -> User:
        user = User(
            full_name=full_name,
            email=email,
            password_hash=password_hash,
            role="user",
            terms_accepted_at=terms_accepted_at,
            terms_version=terms_version,
            newsletter_consent=newsletter_consent,
            newsletter_consent_at=newsletter_consent_at,
        )
        user.current_plan = await self._free_plan()
        self._session.add(user)
        await self._session.flush()
        return user

    async def add_from_google(
        self,
        *,
        full_name: str,
        email: str,
        google_sub: str,
        terms_accepted_at: datetime,
        terms_version: str,
    ) -> User:
        user = User(
            full_name=full_name,
            email=email,
            password_hash=None,
            google_sub=google_sub,
            role="user",
            is_active=True,
            terms_accepted_at=terms_accepted_at,
            terms_version=terms_version,
            newsletter_consent=False,
            newsletter_consent_at=None,
        )
        user.current_plan = await self._free_plan()
        self._session.add(user)
        await self._session.flush()
        return user

    async def update_full_name(
        self,
        user: User,
        *,
        full_name: str,
    ) -> User:
        user.full_name = full_name
        await self._session.flush()
        return user

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
        await self._session.flush()
        return user


class AuthSessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(
        self,
        *,
        user_id: uuid.UUID,
        token_hash: str,
        expires_at: datetime,
        user_agent: str | None,
        ip_address: str | None,
    ) -> AuthSession:
        auth_session = AuthSession(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self._session.add(auth_session)
        await self._session.flush()
        return auth_session

    async def get_active_by_token_hash(
        self,
        *,
        token_hash: str,
        now: datetime,
    ) -> AuthSession | None:
        return await self._session.scalar(
            select(AuthSession)
            .options(selectinload(AuthSession.user).selectinload(User.current_plan))
            .where(
                AuthSession.token_hash == token_hash,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now,
            )
        )

    async def revoke(
        self,
        *,
        token_hash: str,
        revoked_at: datetime,
    ) -> AuthSession | None:
        auth_session = await self._session.scalar(
            select(AuthSession).where(AuthSession.token_hash == token_hash)
        )
        if auth_session is not None and auth_session.revoked_at is None:
            auth_session.revoked_at = revoked_at
        return auth_session

    async def revoke_all_for_user(
        self,
        *,
        user_id: uuid.UUID,
        revoked_at: datetime,
    ) -> int:
        auth_sessions = list(
            (
                await self._session.scalars(
                    select(AuthSession).where(
                        AuthSession.user_id == user_id,
                        AuthSession.revoked_at.is_(None),
                    )
                )
            ).all()
        )
        for auth_session in auth_sessions:
            auth_session.revoked_at = revoked_at
        return len(auth_sessions)

    async def revoke_all_for_user_except_token_hash(
        self,
        *,
        user_id: uuid.UUID,
        token_hash: str,
        revoked_at: datetime,
    ) -> int:
        auth_sessions = list(
            (
                await self._session.scalars(
                    select(AuthSession).where(
                        AuthSession.user_id == user_id,
                        AuthSession.token_hash != token_hash,
                        AuthSession.revoked_at.is_(None),
                    )
                )
            ).all()
        )
        for auth_session in auth_sessions:
            auth_session.revoked_at = revoked_at
        return len(auth_sessions)

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.i18n import apply_user_language
from app.db.session import get_db_session
from app.models import User
from app.services.auth import AuthService, InvalidSessionError

DbSession = Annotated[AsyncSession, Depends(get_db_session)]
AppSettings = Annotated[Settings, Depends(get_settings)]


def get_auth_service(
    session: DbSession,
    settings: AppSettings,
) -> AuthService:
    return AuthService(session, settings)


AuthServiceDependency = Annotated[AuthService, Depends(get_auth_service)]


async def get_current_user(
    request: Request,
    service: AuthServiceDependency,
    settings: AppSettings,
) -> User:
    token = request.cookies.get(settings.session_cookie_name)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autentificarea este necesară.",
        )

    try:
        user = await service.get_user_by_session_token(token)
    except InvalidSessionError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesiunea nu mai este validă.",
        ) from exc
    apply_user_language(user.language_preference)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_optional_current_user(
    request: Request,
    service: AuthServiceDependency,
    settings: AppSettings,
) -> User | None:
    token = request.cookies.get(settings.session_cookie_name)
    if token is None:
        return None

    try:
        user = await service.get_user_by_session_token(token)
    except InvalidSessionError:
        return None
    apply_user_language(user.language_preference)
    return user


OptionalCurrentUser = Annotated[User | None, Depends(get_optional_current_user)]


async def get_current_admin_user(current_user: CurrentUser) -> User:
    if current_user.role.strip().lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesul administrativ este necesar.",
        )
    return current_user


CurrentAdminUser = Annotated[User, Depends(get_current_admin_user)]

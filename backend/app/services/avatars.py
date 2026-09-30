"""Profile pictures: accept one, serve it, throw it away.

The browser scales and crops the picture to a small square before it ever
reaches us, so what arrives here is a few dozen kilobytes. That is small
enough to keep in the database, which means a picture survives a redeploy
without anyone having to remember to mount a disk for it.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserAvatar

# Room for a 512x512 photograph, far more than the square the browser sends.
MAX_AVATAR_BYTES = 512 * 1024

# SVG is deliberately absent: it is a document that can carry script, and we
# serve these from our own domain.
ALLOWED_AVATAR_TYPES: dict[str, tuple[bytes, ...]] = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/webp": (b"RIFF",),
}


class AvatarRejectedError(Exception):
    """The upload is not a picture we are willing to store and serve back."""


def _normalized_content_type(content_type: str | None) -> str:
    return (content_type or "").split(";")[0].strip().lower()


def validated_avatar(content_type: str | None, data: bytes) -> str:
    """Return the content type to store, or say why the upload is refused.

    The declared type is checked against the first bytes of the file as well:
    a browser will happily label anything, and we are about to serve this back
    to a browser with that same label on it.
    """
    if not data:
        raise AvatarRejectedError("Fisierul este gol.")
    if len(data) > MAX_AVATAR_BYTES:
        raise AvatarRejectedError("Imaginea este prea mare.")

    normalized = _normalized_content_type(content_type)
    signatures = ALLOWED_AVATAR_TYPES.get(normalized)
    if signatures is None:
        raise AvatarRejectedError("Foloseste o imagine PNG, JPG sau WEBP.")
    if not any(data.startswith(signature) for signature in signatures):
        raise AvatarRejectedError("Fisierul nu este o imagine valida.")
    if normalized == "image/webp" and data[8:12] != b"WEBP":
        raise AvatarRejectedError("Fisierul nu este o imagine valida.")
    return normalized


class AvatarService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, *, user: User, content_type: str | None, data: bytes) -> None:
        stored_type = validated_avatar(content_type, data)
        now = datetime.now(UTC)

        avatar = await self._session.get(UserAvatar, user.id)
        if avatar is None:
            avatar = UserAvatar(user_id=user.id)
            self._session.add(avatar)
        avatar.content_type = stored_type
        avatar.image = data
        avatar.updated_at = now

        # The user row carries the timestamp so that every page that shows the
        # picture knows there is one, and gets a fresh copy after a change,
        # without reading the bytes.
        user.avatar_updated_at = now

    async def remove(self, *, user: User) -> None:
        await self._session.execute(
            delete(UserAvatar).where(UserAvatar.user_id == user.id)
        )
        user.avatar_updated_at = None

    async def fetch(self, *, user_id: uuid.UUID) -> UserAvatar | None:
        return await self._session.scalar(
            select(UserAvatar).where(UserAvatar.user_id == user_id)
        )

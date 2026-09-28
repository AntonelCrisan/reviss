import base64
import hashlib
import hmac
import secrets
import uuid

from pwdlib import PasswordHash

password_hasher = PasswordHash.recommended()
dummy_password_hash = password_hasher.hash(
    "revizzio-dummy-password-used-only-for-timing-resistance"
)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def unsubscribe_token(user_id: uuid.UUID, secret: str) -> str:
    """A link that stops the tips emails without asking anyone to log in.

    Signed rather than stored: the mail client's own one-click unsubscribe
    has to work months later, from a device that was never signed in.
    """
    payload = user_id.hex
    signature = hmac.new(
        secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).digest()
    encoded = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{payload}.{encoded}"


def user_id_from_unsubscribe_token(token: str, secret: str) -> uuid.UUID | None:
    payload, _, _signature = token.partition(".")
    try:
        user_id = uuid.UUID(hex=payload)
    except ValueError:
        return None
    if not hmac.compare_digest(token, unsubscribe_token(user_id, secret)):
        return None
    return user_id


def hash_session_token(token: str, secret: str) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

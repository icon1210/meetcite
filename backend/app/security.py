"""Password hashing (Argon2) and JWT access tokens (spec §14)."""

from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import get_settings

_hasher = PasswordHasher()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def create_access_token(user_id: int) -> str:
    settings = get_settings()
    expires = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": str(user_id), "exp": expires}, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> int | None:
    """Return the user ID in a valid token, or None if it is invalid or expired."""
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
        if payload.get("scope") is not None:  # media tokens must not work as login tokens
            return None
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def create_media_token(user_id: int, meeting_id: int, hours: int = 6) -> str:
    """A token that only allows streaming one meeting's audio.

    The browser's <audio> element cannot send an Authorization header, so the
    audio URL carries this narrowly scoped token instead of the login token.
    """
    expires = datetime.now(UTC) + timedelta(hours=hours)
    claims = {"sub": str(user_id), "mid": meeting_id, "scope": "media", "exp": expires}
    return jwt.encode(claims, get_settings().secret_key, algorithm=ALGORITHM)


def decode_media_token(token: str, meeting_id: int) -> int | None:
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
        if payload.get("scope") != "media" or payload.get("mid") != meeting_id:
            return None
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None

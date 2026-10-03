import uuid
from datetime import UTC, datetime, timedelta, timezone

import bcrypt
import jwt
from jwt import InvalidTokenError

from app.core.config import get_settings

# PyJWT — migrated from python-jose (2026-08-14): python-jose 3.3.0 is
# unmaintained with CVE-2024-33663/33664; PyJWT's encode/decode API is
# signature-compatible for our usage (encode(payload, key, algorithm=...),
# decode(token, key, algorithms=[...])).

settings = get_settings()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=settings.bcrypt_rounds)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: str, token_type: str = "access") -> str:
    """Create a JWT token.

    Args:
        user_id: The user's ID to encode as the subject.
        token_type: "access" for short-lived access tokens, "refresh" for
            longer-lived refresh tokens.

    Returns:
        Encoded JWT string.
    """
    if token_type == "refresh":
        # Refresh token TTL from its own knob (days); access uses minutes.
        expire_minutes = settings.jwt_refresh_expire_days * 24 * 60
    else:
        expire_minutes = settings.jwt_expire_minutes

    expire = datetime.now(UTC) + timedelta(minutes=expire_minutes)
    payload = {
        "sub": user_id,
        "exp": expire,
        "iat": datetime.now(UTC),
        "type": token_type,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    """Decode a JWT and return the full payload dict, or None if invalid/expired."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except InvalidTokenError:
        return None


def validate_password_strength(password: str) -> None:
    """Validate password meets complexity requirements.

    Raises ValueError with a specific message if any requirement is not met.
    """
    if len(password) < 8:
        raise ValueError("密码至少 8 位")
    if not any(c.isupper() for c in password):
        raise ValueError("密码需包含至少一个大写字母")
    if not any(c.islower() for c in password):
        raise ValueError("密码需包含至少一个小写字母")
    if not any(c.isdigit() for c in password):
        raise ValueError("密码需包含至少一个数字")

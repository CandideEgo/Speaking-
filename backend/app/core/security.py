import hashlib
import uuid
from datetime import UTC, datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

settings = get_settings()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=settings.bcrypt_rounds)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def token_lookup_hash(raw_token: str) -> str:
    """Deterministic SHA-256 hex digest of a raw token, for indexed DB lookup.

    Used by the password-reset flow to find the candidate token row in O(1)
    (by indexed token_lookup) instead of bcrypt-verifying every unexpired
    token (O(n) slow + timing leak). The raw token is never stored; the
    bcrypt token_hash remains the authoritative verification.
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


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
        expire_minutes = settings.jwt_expire_minutes * 4  # Refresh token lasts 4x longer
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
    except JWTError:
        return None


def create_token_pair(user_id: str) -> dict[str, str]:
    """Create an access token + refresh token pair.

    Returns:
        Dict with 'access_token' and 'refresh_token' keys.
    """
    return {
        "access_token": create_token(user_id, token_type="access"),
        "refresh_token": create_token(user_id, token_type="refresh"),
    }


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

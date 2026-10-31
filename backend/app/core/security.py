import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from jwt import InvalidTokenError

from app.core.config import get_settings

# PyJWT — migrated from python-jose (2026-08-14): python-jose 3.3.0 is
# unmaintained with CVE-2024-33663/33664; PyJWT's encode/decode API is
# signature-compatible for our usage (encode(payload, key, algorithm=...),
# decode(token, key, algorithms=[...])).

settings = get_settings()

#: bcrypt only ever consumes the first 72 bytes of a password. bcrypt <= 4 hashed
#: the prefix silently; bcrypt >= 5 raises ``ValueError`` instead. Both outcomes
#: are bad if the product accepts 128 characters and passes them through, so the
#: contract is explicit — **at most 72 UTF-8 bytes** (72 ASCII chars, ~24 CJK
#: chars) at every entry point, never a silent truncation when hashing.
BCRYPT_MAX_PASSWORD_BYTES = 72


def _password_bytes(password: str) -> bytes:
    data = password.encode("utf-8")
    if len(data) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(f"password exceeds {BCRYPT_MAX_PASSWORD_BYTES} UTF-8 bytes")
    return data


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt(rounds=settings.bcrypt_rounds)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    data = plain.encode("utf-8")
    if len(data) > BCRYPT_MAX_PASSWORD_BYTES:
        # Legacy compatibility only: an account whose password was set before
        # this contract existed may hold a hash over the first 72 bytes (what
        # bcrypt 4 hashed). New passwords can never exceed the limit, so this
        # branch cannot weaken a hash we created — and it keeps a wrong long
        # guess a 401 instead of the ValueError bcrypt 5 raises (a 500).
        data = data[:BCRYPT_MAX_PASSWORD_BYTES]
    return bcrypt.checkpw(data, hashed.encode("utf-8"))


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
    from jwt import InvalidKeyError

    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except (InvalidTokenError, InvalidKeyError):
        # InvalidKeyError is a sibling of InvalidTokenError (both PyJWTError),
        # not a subclass; an empty/弱 key must not escape as a 500.
        return None


def validate_password_strength(password: str) -> None:
    """Validate password meets complexity requirements.

    Raises ValueError with a specific message if any requirement is not met.
    The byte limit is the bcrypt contract (see ``BCRYPT_MAX_PASSWORD_BYTES``):
    it is checked here so every schema returns a readable 422 instead of the
    endpoint failing inside bcrypt.
    """
    if len(password) < 8:
        raise ValueError("密码至少 8 位")
    if len(password.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError(f"密码最多 {BCRYPT_MAX_PASSWORD_BYTES} 个字节（约 24 个汉字或 72 个英文字符）")
    if not any(c.isupper() for c in password):
        raise ValueError("密码需包含至少一个大写字母")
    if not any(c.islower() for c in password):
        raise ValueError("密码需包含至少一个小写字母")
    if not any(c.isdigit() for c in password):
        raise ValueError("密码需包含至少一个数字")

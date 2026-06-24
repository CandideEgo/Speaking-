from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

settings = get_settings()

_limits = [] if settings.env == "testing" else ["200/minute"]


def _rate_limit_key(request: Request) -> str:
    """Rate limit key: user ID if authenticated, otherwise IP address.

    Decodes the JWT from the Authorization header without a DB lookup.
    Falls back to IP address for anonymous requests or invalid tokens.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            from app.core.security import decode_token

            payload = decode_token(auth_header[7:])
            if payload and payload.get("sub"):
                return f"user:{payload['sub']}"
        except Exception:
            pass
    # Fall back to IP address
    return get_remote_address(request)


limiter = Limiter(
    key_func=_rate_limit_key,
    storage_uri=settings.redis_url if settings.env != "testing" else "memory://",
    default_limits=_limits,
)


def rate_limit(limit_str: str):
    """Apply rate limit decorator (noop in testing)."""
    if settings.env == "testing":
        return lambda f: f
    return limiter.limit(limit_str)

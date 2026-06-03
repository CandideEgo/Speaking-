from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import get_settings

settings = get_settings()

_limits = [] if settings.env == "testing" else ["200/minute"]

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url if settings.env == "production" else "memory://",
    default_limits=_limits,
)


def rate_limit(limit_str: str):
    """Apply rate limit decorator (noop in testing)."""
    if settings.env == "testing":
        return lambda f: f
    return limiter.limit(limit_str)

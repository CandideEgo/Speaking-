"""JWT token blacklist backed by Redis.

When a user logs out (or an admin revokes a token), the token's JTI is stored
in Redis with a TTL equal to the token's remaining lifetime. On every request,
the auth dependency checks whether the JTI is blacklisted.

Design choices:
  - **Fail-open**: if Redis is unavailable the request is allowed through.
    Blocking all authenticated traffic because Redis is down would be worse
    than letting a few revoked tokens slip.
  - **Key format**: ``token_blacklist:{jti}`` — simple, O(1) lookup.
  - **TTL**: set to the token's remaining validity so keys auto-expire
    when the token would have expired anyway.
"""

import structlog

logger = structlog.get_logger(__name__)


async def _get_redis():
    """Create a short-lived async Redis client.

    Follows the same pattern as ``app.api.v1.feed_base._redis_get`` —
    open a connection per call and close it immediately.  This avoids
    lifecycle coupling with the FastAPI app and works correctly in
    both dev (single-process) and prod (gunicorn multi-worker) setups.
    """
    import redis.asyncio as aioredis
    from app.core.config import get_settings

    settings = get_settings()
    return aioredis.from_url(settings.redis_url)


async def blacklist_token(jti: str, ttl_seconds: int) -> None:
    """Add a token JTI to the blacklist.

    Args:
        jti: The JWT ID claim (unique per token).
        ttl_seconds: How long to keep the key — should equal the
                     token's remaining validity (exp - now).
    """
    if ttl_seconds <= 0:
        # Token already expired — nothing to blacklist.
        return

    try:
        client = await _get_redis()
        await client.set(f"token_blacklist:{jti}", "1", ex=ttl_seconds)
        await client.close()
        logger.debug("token_blacklisted", jti=jti, ttl=ttl_seconds)
    except Exception:
        # Fail open — log but don't raise.
        logger.warning("token_blacklist_redis_error", jti=jti, exc_info=True)


async def is_token_blacklisted(jti: str | None) -> bool:
    """Check whether a token JTI has been blacklisted.

    Returns False if:
      - jti is None (tokens issued before the blacklist feature was added)
      - Redis is unavailable (fail-open)
      - The key does not exist in Redis
    """
    if jti is None:
        return False

    try:
        client = await _get_redis()
        result = await client.exists(f"token_blacklist:{jti}")
        await client.close()
        return bool(result)
    except Exception:
        # Fail open — if Redis is down, allow the request through.
        logger.warning("token_blacklist_check_redis_error", jti=jti, exc_info=True)
        return False

"""Shared async Redis client singleton.

All services that need Redis should use ``get_redis()`` instead of
creating ad-hoc connections with ``aioredis.from_url()``.  The singleton
keeps a connection pool alive for the lifetime of the process, avoiding
the overhead of opening/closing a TCP connection per call.

Call ``close_redis()`` during app shutdown (via the lifespan handler).
"""

import redis.asyncio as aioredis
import structlog

from app.core.config import get_settings

logger = structlog.get_logger(__name__)

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    """Return the shared async Redis client singleton.

    Lazily initialises on first call.  Thread-safe for gunicorn workers
    (each worker has its own process, so no lock is needed).
    """
    global _redis
    if _redis is None:
        settings = get_settings()
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
        logger.info("redis_client_created", url=settings.redis_url)
    return _redis


async def close_redis() -> None:
    """Close the shared Redis client.  Called on app shutdown.

    ``aclose()`` only exists on redis-py >= 5.0.1; production pins 5.0.0,
    where the async client exposes ``close()`` instead. Using the wrong one
    raises AttributeError and makes gunicorn report "Application shutdown
    failed" on every worker stop.
    """
    global _redis
    if _redis is not None:
        if hasattr(_redis, "aclose"):
            await _redis.aclose()
        else:
            await _redis.close()
        _redis = None
        logger.info("redis_client_closed")

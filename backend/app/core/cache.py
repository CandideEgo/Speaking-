"""Thin Redis caching utility.

All functions are **fail-open**: if Redis is unavailable the caller gets
``None`` / no-op instead of an exception.  This prevents a Redis outage
from breaking the entire API — queries just fall through to the database.

Typical usage::

    from app.core.cache import cache_get, cache_set

    cached = await cache_get("browse:feed:all:A2:1:20")
    if cached:
        return json.loads(cached)

    data = await _expensive_query(...)
    await cache_set("browse:feed:all:A2:1:20", json.dumps(data), ttl=300)
    return data
"""

import json

import structlog

from app.core.redis import get_redis

logger = structlog.get_logger(__name__)


async def cache_get(key: str) -> str | None:
    """Retrieve a cached value.  Returns None on miss or Redis error."""
    try:
        r = get_redis()
        return await r.get(key)
    except Exception:
        logger.warning("cache_get_error", key=key, exc_info=True)
        return None


async def cache_set(key: str, value: str, ttl: int = 300) -> None:
    """Store a value with a TTL (seconds).  No-op on Redis error."""
    try:
        r = get_redis()
        await r.set(key, value, ex=ttl)
    except Exception:
        logger.warning("cache_set_error", key=key, exc_info=True)


async def cache_delete(pattern: str) -> None:
    """Delete all keys matching a pattern (e.g. ``browse:feed:*``).

    Uses ``SCAN`` (not ``KEYS``) to avoid blocking Redis on large datasets.
    """
    try:
        r = get_redis()
        async for key in r.scan_iter(pattern):
            await r.delete(key)
    except Exception:
        logger.warning("cache_delete_error", pattern=pattern, exc_info=True)


# ---------------------------------------------------------------------------
# Convenience helpers that (de)serialize JSON automatically
# ---------------------------------------------------------------------------


async def cache_get_json(key: str) -> dict | list | None:
    """Retrieve and deserialize a JSON value.  Returns None on miss/error."""
    raw = await cache_get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


async def cache_set_json(key: str, value: dict | list, ttl: int = 300) -> None:
    """Serialize and store a JSON value with a TTL."""
    await cache_set(key, json.dumps(value, ensure_ascii=False), ttl=ttl)

"""Shared feed factory — common logic for all platform feed routers.

Every platform (bilibili, community, douyin, …) creates a router via
``create_feed_router()`` and only supplies platform-specific config:
prefix, tag, category list, and an optional search-function override.

Response shape is guaranteed uniform across all feeds:
    { items: [...], page: int, page_size: int, has_more: bool, total: int }
"""

import json
import structlog
import time
from dataclasses import dataclass, field
from typing import Callable, Awaitable, Optional

from fastapi import APIRouter, Query, Request

from app.services.youtube_service import search_youtube
from app.core.limiter import rate_limit

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Redis-backed cache (falls back to in-process dict when Redis is unavailable)
# ---------------------------------------------------------------------------

_cache_fallback: dict[str, tuple[list[dict], float]] = {}
_CACHE_TTL = 600
_MAX_CACHE_ENTRIES = 100


async def _redis_get(key: str) -> Optional[list[dict]]:
    """Try to read from Redis; return None on any failure."""
    try:
        import redis.asyncio as aioredis
        from app.core.config import get_settings

        settings = get_settings()
        client = aioredis.from_url(settings.redis_url)
        raw = await client.get(key)
        await client.close()
        if raw is not None:
            return json.loads(raw)
    except Exception:
        pass  # fall back to in-process cache
    return None


async def _redis_set(key: str, items: list[dict], ttl: int = _CACHE_TTL) -> None:
    """Try to write to Redis; silently ignore failures."""
    try:
        import redis.asyncio as aioredis
        from app.core.config import get_settings

        settings = get_settings()
        client = aioredis.from_url(settings.redis_url)
        await client.set(key, json.dumps(items, ensure_ascii=False), ex=ttl)
        await client.close()
    except Exception:
        pass


def _clean_expired_fallback_cache() -> None:
    """Evict stale entries from the in-process fallback cache."""
    now = time.time()
    expired = [k for k, (_, ts) in _cache_fallback.items() if now - ts >= _CACHE_TTL]
    for k in expired:
        del _cache_fallback[k]


async def _cache_get(cache_key: str) -> Optional[list[dict]]:
    """Read-through cache: Redis first, then in-process fallback."""
    # 1. Try Redis
    items = await _redis_get(cache_key)
    if items is not None:
        return items

    # 2. In-process fallback
    _clean_expired_fallback_cache()
    if cache_key in _cache_fallback:
        items, ts = _cache_fallback[cache_key]
        if time.time() - ts < _CACHE_TTL:
            return items
    return None


async def _cache_set(cache_key: str, items: list[dict]) -> None:
    """Write-through cache: Redis + in-process fallback."""
    await _redis_set(cache_key, items)
    if len(_cache_fallback) >= _MAX_CACHE_ENTRIES:
        oldest = min(_cache_fallback, key=lambda k: _cache_fallback[k][1])
        del _cache_fallback[oldest]
    _cache_fallback[cache_key] = (items, time.time())


# ---------------------------------------------------------------------------
# Platform config dataclass
# ---------------------------------------------------------------------------

@dataclass
class FeedConfig:
    """Platform-specific feed configuration."""

    prefix: str                          # e.g. "/bilibili"
    tag: str                             # e.g. "bilibili"
    categories: list[dict] = field(default_factory=list)
    feed_doc: str = "Paginated content feed."
    error_label: str = "Feed"            # Used in error log messages
    search_fn: Callable[[str, int], Awaitable[list[dict]]] = field(
        default_factory=lambda: search_youtube
    )


# ---------------------------------------------------------------------------
# Router factory
# ---------------------------------------------------------------------------

def create_feed_router(cfg: FeedConfig) -> APIRouter:
    """Build a fully-configured feed router for a single platform."""

    router = APIRouter(prefix=cfg.prefix, tags=[cfg.tag])

    @router.get("/categories")
    @rate_limit("30/minute")
    async def list_categories(request: Request):
        return {"categories": cfg.categories}

    @router.get("/feed")
    @rate_limit("30/minute")
    async def feed(
        request: Request,
        category: str = Query("all"),
        page: int = Query(1, ge=1, le=10),
        page_size: int = Query(20, ge=4, le=50),
    ):
        """Paginated content feed with uniform response shape."""
        cat = next(
            (c for c in cfg.categories if c["id"] == category),
            cfg.categories[0],
        )
        query = cat["query"]

        cache_key = f"feed:{cfg.prefix}:{category}:{page}"
        items = await _cache_get(cache_key)
        if items is not None:
            return _feed_response(items, page, page_size)

        try:
            items = await cfg.search_fn(query, page_size=page_size)
        except Exception:
            logger.exception("feed search failed", platform=cfg.error_label)
            return _feed_response([], page, page_size, error="Search temporarily unavailable")

        await _cache_set(cache_key, items)
        return _feed_response(items, page, page_size)

    return router


# ---------------------------------------------------------------------------
# Response helper
# ---------------------------------------------------------------------------

def _feed_response(
    items: list[dict],
    page: int,
    page_size: int,
    error: Optional[str] = None,
) -> dict:
    """Build the uniform feed response envelope."""
    result: dict = {
        "items": items,
        "page": page,
        "page_size": page_size,
        "has_more": len(items) >= page_size,
        "total": len(items),
    }
    if error:
        result["error"] = error
        result["has_more"] = False
    return result

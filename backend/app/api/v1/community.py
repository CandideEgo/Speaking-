import asyncio
import logging
import time

from fastapi import APIRouter, Query

from app.services.youtube_service import search_youtube

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/community", tags=["community"])

CATEGORIES: list[dict] = [
    {"id": "all", "label": "All", "query": "best English learning video"},
    {"id": "ted", "label": "TED Talks", "query": "TED talk inspiring English"},
    {"id": "interview", "label": "Interviews", "query": "insightful interview English learning"},
    {"id": "news", "label": "News", "query": "BBC NNP English news clear speech"},
    {"id": "vlog", "label": "Vlogs", "query": "English vlog authentic daily life"},
    {"id": "educational", "label": "Educational", "query": "English lesson teaching tips"},
    {"id": "movie", "label": "Movie Clips", "query": "classic movie scene English"},
    {"id": "tech", "label": "Tech", "query": "tech review explainer English"},
]

_cache: dict[str, tuple[list[dict], float]] = {}
_CACHE_TTL = 600
_MAX_CACHE_ENTRIES = 100


def _clean_expired_cache():
    now = time.time()
    expired = [k for k, (_, ts) in _cache.items() if now - ts >= _CACHE_TTL]
    for k in expired:
        del _cache[k]


@router.get("/categories")
async def list_categories():
    return {"categories": CATEGORIES}


@router.get("/feed")
async def community_feed(
    category: str = Query("all"),
    page: int = Query(1, ge=1, le=10),
    page_size: int = Query(20, ge=4, le=50),
):
    cat = next((c for c in CATEGORIES if c["id"] == category), CATEGORIES[0])
    query = cat["query"]

    _clean_expired_cache()
    cache_key = f"{category}:{page}"
    if cache_key in _cache:
        items, ts = _cache[cache_key]
        if time.time() - ts < _CACHE_TTL:
            return {"items": items, "category": cat, "page": page, "has_more": len(items) >= page_size}

    try:
        items = await search_youtube(query, page_size=page_size)
    except Exception:
        logger.exception("Community feed search failed")
        return {"items": [], "category": cat, "page": page, "has_more": False,
                "error": "Search temporarily unavailable"}

    if len(_cache) >= _MAX_CACHE_ENTRIES:
        oldest = min(_cache, key=lambda k: _cache[k][1])
        del _cache[oldest]
    _cache[cache_key] = (items, time.time())
    return {"items": items, "category": cat, "page": page, "has_more": len(items) >= page_size}

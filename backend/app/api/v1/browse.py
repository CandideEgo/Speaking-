import asyncio
import time
from typing import Optional

from fastapi import APIRouter, Query

from app.services.youtube_service import search_youtube

router = APIRouter(prefix="/browse", tags=["browse"])

CATEGORIES: list[dict] = [
    {"id": "all", "label": "All", "query": "English video"},
    {"id": "ted", "label": "TED Talks", "query": "TED talk English"},
    {"id": "interview", "label": "Interviews", "query": "celebrity interview English"},
    {"id": "news", "label": "News", "query": "English news report"},
    {"id": "vlog", "label": "Vlogs", "query": "daily life vlog English"},
    {"id": "educational", "label": "Educational", "query": "English lesson educational"},
    {"id": "movie", "label": "Movie Clips", "query": "English movie scene clip"},
    {"id": "tech", "label": "Tech", "query": "technology review English"},
]

LEVEL_MODIFIERS: dict[str, str] = {
    "A1": "beginner slow simple",
    "A2": "easy basic",
    "B1": "intermediate",
    "B2": "upper intermediate",
    "C1": "advanced",
    "C2": "advanced native",
}

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
async def browse_feed(
    category: str = Query("all"),
    level: Optional[str] = Query(None, max_length=2),
    page: int = Query(1, ge=1, le=10),
    page_size: int = Query(20, ge=4, le=50),
):
    """Paginated content feed — YouTube videos curated by category and level."""
    cat = next((c for c in CATEGORIES if c["id"] == category), CATEGORIES[0])
    query = cat["query"]
    if level and level in LEVEL_MODIFIERS:
        query = f"{query} {LEVEL_MODIFIERS[level]}"

    _clean_expired_cache()
    cache_key = f"{category}:{level or 'any'}:{page}"
    if cache_key in _cache:
        items, ts = _cache[cache_key]
        if time.time() - ts < _CACHE_TTL:
            return {"items": items, "category": cat, "page": page, "has_more": len(items) >= page_size}

    try:
        items = await search_youtube(query, page_size=page_size)
    except Exception as e:
        return {"items": [], "category": cat, "page": page, "has_more": False,
                "error": f"Search failed: {e}"}

    if len(_cache) >= _MAX_CACHE_ENTRIES:
        oldest = min(_cache, key=lambda k: _cache[k][1])
        del _cache[oldest]
    _cache[cache_key] = (items, time.time())
    return {"items": items, "category": cat, "page": page, "has_more": len(items) >= page_size}

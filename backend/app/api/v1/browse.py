import asyncio
import time
from typing import Optional

from fastapi import APIRouter, Query

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

# Simple in-memory cache with TTL
_cache: dict[str, tuple[list[dict], float]] = {}
_CACHE_TTL = 600  # 10 minutes


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
    import yt_dlp

    cat = next((c for c in CATEGORIES if c["id"] == category), CATEGORIES[0])
    query = cat["query"]
    if level and level in LEVEL_MODIFIERS:
        query = f"{query} {LEVEL_MODIFIERS[level]}"

    cache_key = f"{category}:{level or 'any'}:{page}"
    if cache_key in _cache:
        items, ts = _cache[cache_key]
        if time.time() - ts < _CACHE_TTL:
            return {"items": items, "category": cat, "page": page, "has_more": len(items) >= page_size}

    loop = asyncio.get_event_loop()

    def _sync_search():
        search_query = f"ytsearch{page_size}:{query}"
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": False,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(search_query, download=False)

    try:
        info = await loop.run_in_executor(None, _sync_search)
    except Exception as e:
        return {"items": [], "category": cat, "page": page, "has_more": False,
                "error": f"Search failed: {e}"}

    items = []
    for entry in info.get("entries", []) or []:
        if not entry:
            continue
        items.append({
            "video_id": entry.get("id", ""),
            "url": entry.get("webpage_url") or f"https://www.youtube.com/watch?v={entry.get('id', '')}",
            "title": entry.get("title", ""),
            "description": entry.get("description") or "",
            "channel_title": entry.get("channel") or entry.get("uploader") or "",
            "thumbnail_url": entry.get("thumbnail") or "",
            "duration": entry.get("duration"),
            "view_count": entry.get("view_count"),
        })

    _cache[cache_key] = (items, time.time())
    return {"items": items, "category": cat, "page": page, "has_more": len(items) >= page_size}

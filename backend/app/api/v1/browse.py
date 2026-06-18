import asyncio
import structlog
import time
from typing import Optional

from fastapi import APIRouter, Query, Request
from sqlalchemy import select

from app.services.youtube_service import search_youtube
from app.core.limiter import rate_limit

logger = structlog.get_logger()

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
@rate_limit("30/minute")
async def list_categories(request: Request):
    return {"categories": CATEGORIES}


@router.get("/feed")
@rate_limit("30/minute")
async def browse_feed(
    request: Request,
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
            return {"items": items, "category": cat, "page": page, "page_size": page_size, "has_more": len(items) >= page_size}

    try:
        items = await search_youtube(query, page_size=page_size)
    except Exception:
        logger.exception("Browse feed search failed")
        items = []

    # Fallback: if search failed or returned no results, use official videos from DB
    if not items:
        fallback = await _fallback_official_videos(category=category, limit=page_size)
        if fallback:
            return {"items": fallback, "category": cat, "page": page, "page_size": page_size, "has_more": False}
        return {"items": [], "category": cat, "page": page, "page_size": page_size, "has_more": False,
                "error": "Search temporarily unavailable"}

    if len(_cache) >= _MAX_CACHE_ENTRIES:
        oldest = min(_cache, key=lambda k: _cache[k][1])
        del _cache[oldest]
    _cache[cache_key] = (items, time.time())
    return {"items": items, "category": cat, "page": page, "page_size": page_size, "has_more": len(items) >= page_size}


async def _fallback_official_videos(category: str = "all", limit: int = 20) -> list[dict]:
    """Return official videos from DB when YouTube search is unavailable.

    Converts Video records to the VideoItem format expected by the frontend.
    """
    from app.core.database import async_session
    from app.models.video import Video, VideoStatus

    async with async_session() as db:
        stmt = (
            select(Video)
            .where(
                Video.is_official == True,
                Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
            )
            .order_by(Video.created_at.desc())
            .limit(limit)
        )
        # Filter by topic_tags if a specific category is requested
        if category and category != "all":
            stmt = (
                select(Video)
                .where(
                    Video.is_official == True,
                    Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
                    Video.topic_tags == category,
                )
                .order_by(Video.created_at.desc())
                .limit(limit)
            )

        result = await db.execute(stmt)
        videos = result.scalars().all()

        items = []
        for v in videos:
            video_id = v.youtube_video_id or v.id
            items.append({
                "video_id": video_id,
                "url": v.source_url,
                "title": v.title,
                "channel_title": "",  # Not stored in Video model
                "thumbnail_url": v.thumbnail_url or f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg",
                "duration": v.duration,
                "view_count": None,
            })
        return items

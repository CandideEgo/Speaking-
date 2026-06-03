import asyncio
import time

from fastapi import APIRouter, Query

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


@router.get("/categories")
async def list_categories():
    return {"categories": CATEGORIES}


@router.get("/feed")
async def community_feed(
    category: str = Query("all"),
    page: int = Query(1, ge=1, le=10),
    page_size: int = Query(20, ge=4, le=50),
):
    import yt_dlp

    cat = next((c for c in CATEGORIES if c["id"] == category), CATEGORIES[0])
    query = cat["query"]

    cache_key = f"{category}:{page}"
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
        with yt_dlp.YoutubeDL(ytdlp_opts) as ydl:
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

import asyncio
import structlog

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.api.dependencies import get_current_user
from app.models.user import User
from app.core.limiter import rate_limit

logger = structlog.get_logger()

router = APIRouter(prefix="/youtube", tags=["youtube"])


@router.get("/search")
@rate_limit("10/minute")
async def search_youtube(
    request: Request,
    q: str = Query(..., min_length=1, max_length=200),
    max_results: int = Query(20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    """Search YouTube via yt-dlp (no API key required). Auth required."""
    import yt_dlp

    loop = asyncio.get_event_loop()

    def _sync_search():
        search_query = f"ytsearch{max_results}:{q}"
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": True,
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(search_query, download=False)
        except Exception:
            logger.exception("youtube search failed")
            raise HTTPException(status_code=500, detail="Search temporarily unavailable")

        items = []
        for entry in info.get("entries", []) or []:
            items.append({
                "video_id": entry.get("id", ""),
                "url": entry.get("webpage_url") or f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                "title": entry.get("title", ""),
                "description": entry.get("description") or "",
                "channel_title": entry.get("channel") or entry.get("uploader") or "",
                "thumbnail_url": entry.get("thumbnail") or entry.get("thumbnails", [{}])[0].get("url", ""),
                "duration": entry.get("duration"),
                "published_at": entry.get("upload_date") or "",
            })

        return {"items": items, "total": len(items)}

    return await loop.run_in_executor(None, _sync_search)

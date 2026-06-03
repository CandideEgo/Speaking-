import asyncio
from typing import Optional

import yt_dlp


async def search_youtube(
    query: str,
    page_size: int = 20,
    extract_flat: bool = False,
) -> list[dict]:
    """Search YouTube via yt-dlp and return formatted results.

    Args:
        query: Search query string.
        page_size: Number of results to fetch.
        extract_flat: If True, use extract_flat for faster metadata retrieval.

    Returns:
        List of video dictionaries with standardized fields.
    """
    loop = asyncio.get_event_loop()

    def _sync_search():
        search_query = f"ytsearch{page_size}:{query}"
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": extract_flat,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(search_query, download=False)

    info = await loop.run_in_executor(None, _sync_search)

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

    return items

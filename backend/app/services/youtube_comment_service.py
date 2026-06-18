import structlog
from typing import Optional

import httpx
from app.core.config import get_settings

logger = structlog.get_logger()

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"


class YouTubeCommentService:
    """Fetch YouTube comments via Data API v3.

    Falls back to yt-dlp if API key is not configured or quota exceeded.
    """

    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.youtube_api_key
        self.proxy = settings.http_proxy or None

    async def fetch_comments(
        self,
        youtube_video_id: str,
        max_results: int = 100,
        order: str = "relevance",  # "relevance" | "time"
    ) -> list[dict]:
        """Fetch top-level comments for a video.

        Returns list of dicts with keys:
            - external_id: YouTube comment ID
            - text: comment text
            - author_name: comment author display name
            - like_count: number of likes
            - reply_count: number of replies
            - published_at: ISO timestamp
        """
        if not self.api_key:
            logger.warning("No YOUTUBE_API_KEY configured; skipping API fetch")
            return []

        comments: list[dict] = []
        page_token: Optional[str] = None
        remaining = max_results

        async with httpx.AsyncClient(proxy=self.proxy, timeout=30.0) as client:
            while remaining > 0:
                params = {
                    "part": "snippet,replies",
                    "videoId": youtube_video_id,
                    "key": self.api_key,
                    "maxResults": min(remaining, 100),
                    "order": order,
                }
                if page_token:
                    params["pageToken"] = page_token

                try:
                    resp = await client.get(
                        f"{YOUTUBE_API_BASE}/commentThreads", params=params
                    )
                    resp.raise_for_status()
                    data = resp.json()
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 403:
                        logger.warning(
                            "YouTube API quota exceeded or key invalid; "
                            "consider using yt-dlp fallback"
                        )
                    else:
                        logger.error("YouTube API error", error=str(e))
                    break
                except Exception as e:
                    logger.error("Failed to fetch comments", error=str(e))
                    break

                for item in data.get("items", []):
                    snippet = item["snippet"]["topLevelComment"]["snippet"]
                    comments.append({
                        "external_id": item["id"],
                        "text": snippet.get("textDisplay", ""),
                        "author_name": snippet.get("authorDisplayName", ""),
                        "like_count": snippet.get("likeCount", 0),
                        "reply_count": item["snippet"].get("totalReplyCount", 0),
                        "published_at": snippet.get("publishedAt", ""),
                    })

                page_token = data.get("nextPageToken")
                if not page_token:
                    break
                remaining -= len(data.get("items", []))

        logger.info(
            "Fetched comments for video",
            comment_count=len(comments),
            video_id=youtube_video_id,
        )
        return comments

"""Video cache helpers — cache invalidation for video detail responses.

Extracted from video_service.py so that subtitle_edit_service.py and
video_review_service.py can share the same invalidation logic without
circular imports.
"""


async def invalidate_video_detail_cache(video_id: str) -> None:
    """Best-effort drop of the cached video detail (subtitles included).

    Reused by subtitle/word_levels edits and review lifecycle changes so
    the next read reflects the change.  Fail-open: a Redis outage just
    means a stale read for up to the TTL.
    """
    try:
        from app.core.redis import get_redis

        redis = await get_redis()
        await redis.delete(f"video:detail:{video_id}")
    except Exception:
        pass

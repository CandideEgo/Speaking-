"""Video cache helpers — cache invalidation for video detail responses.

Extracted from video_service.py so that subtitle_edit_service.py and
video_review_service.py can share the same invalidation logic without
circular imports.

Also hosts browse-feed invalidation so service/task layers can call it
without importing from the API route layer (the previous inverse
dependency: video_service and video_processing imported
invalidate_browse_cache from app.api.v1.browse).
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


async def invalidate_browse_cache() -> None:
    """Invalidate all browse feed caches.

    Call this when videos are added/updated (e.g. seed script, video
    processing completion, publish).  Lives in the service layer so callers
    don't have to import from the API route module.
    """
    from app.core.cache import cache_delete

    await cache_delete("browse:feed:*")
    await cache_delete("browse:featured:*")

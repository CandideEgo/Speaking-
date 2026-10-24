"""Video cache helpers — cache invalidation for video detail responses.

Extracted from video_service.py so that subtitle_edit_service.py and
video_review_service.py can share the same invalidation logic without
circular imports.

Also hosts browse-feed invalidation so service/task layers can call it
without importing from the API route layer (the previous inverse
dependency: video_service and video_processing imported
invalidate_browse_cache from app.api.v1.browse).
"""

from app.core.cache import cache_delete


async def invalidate_video_detail_cache(video_id: str) -> None:
    """Best-effort drop of the cached video detail (subtitles included).

    Reused by subtitle/word_levels edits and review lifecycle changes so
    the next read reflects the change.  Fail-open: a Redis outage just
    means a stale read for up to the TTL.
    """
    try:
        from app.core.redis import get_redis

        redis = get_redis()
        await redis.delete(f"video:detail:{video_id}")
    except Exception:
        pass


async def invalidate_like_caches(video_id: str) -> None:
    """Invalidate the surfaces a like count can change.

    ``like_count`` is shown on the detail page, the home featured card and the
    feed card payload (the feed is not *sorted* by likes, but its cached cards
    carry the counter), so the feed family must still be dropped. The ranking
    snapshots — the expensive 48h entries — are left intact.
    """
    await invalidate_video_detail_cache(video_id)
    await cache_delete("browse:featured:*")
    await cache_delete("browse:feed:*")


async def invalidate_favorite_caches(video_id: str) -> None:
    """Invalidate the surfaces a favorite count changes.

    ``favorite_count`` is part of the feed card payload (and of the
    ``favorite`` / ``weekly_favorite`` sort branches), the featured card and
    the detail page; the weekly-favorites ranking snapshot aggregates
    favorites. The latest/hot feeds are dropped too because their cached card
    payloads would otherwise keep the old counter.
    """
    await invalidate_video_detail_cache(video_id)
    await cache_delete("browse:featured:*")
    await cache_delete("browse:feed:*")
    await cache_delete("rankings:snapshot:*:weekly_favorites")


async def invalidate_view_caches(video_id: str) -> None:
    """Invalidate the surfaces a play/complete changes.

    A deduped completion bumps ``view_count`` (hot sort + card payload), adds
    a behavior event (weekly-views ranking), and changes the count shown on
    detail and featured cards. Other ranking scopes stay warm.
    """
    await invalidate_video_detail_cache(video_id)
    await cache_delete("browse:featured:*")
    await cache_delete("browse:feed:*")
    await cache_delete("rankings:snapshot:*:weekly_views")


async def invalidate_browse_cache() -> None:
    """Invalidate all browse feed + home-ranking caches.

    Call this when videos are added/updated/published/taken-down (e.g. seed
    script, video processing completion, publish, takedown). Lives in the
    service layer so callers don't have to import from the API route layer.

    Also drops ``rankings:snapshot:*``: the three home-ranking scopes are read
    from a Redis snapshot (up to 48h TTL, refreshed daily by beat), so
    without this a just-taken-down video would linger on the home rankings
    long after disappearing from the feed.
    """
    await cache_delete("browse:feed:*")
    await cache_delete("browse:featured:*")
    await cache_delete("rankings:snapshot:*")

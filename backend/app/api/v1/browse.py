"""Browse channel — browse local video library by category and difficulty."""

from typing import Literal

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cached
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.favorite import UserFavorite
from app.models.video import Video, VideoStatus
from app.schemas.pagination import PaginatedResponse, paginated
from app.schemas.video import CARD_DESCRIPTION_LIMIT
from app.services.video_classification import TOPIC_CATEGORIES

logger = structlog.get_logger()

router = APIRouter(prefix="/browse", tags=["browse"])

# Canonical taxonomy lives in services/video_classification (the LLM
# whitelist is derived from the same list — they must not drift).
# Shallow copy so endpoint consumers can't mutate the service-level source.
CATEGORIES: list[dict] = [dict(c) for c in TOPIC_CATEGORIES]


@router.get("/categories")
@rate_limit("30/minute")
async def list_categories(request: Request):
    """Return available content categories."""
    return {"categories": CATEGORIES}


@cached(ttl=300, key="browse:feed:{category}:{level_key}:{sort}:{page}:{page_size}")
async def _browse_feed_query(
    *,
    db: AsyncSession,
    category: str,
    level: str | None,
    level_key: str,
    sort: str,
    page: int,
    page_size: int,
) -> dict:
    """DB query for browse feed, cached by @cached."""
    # Base query: official, published, ready videos.
    #
    # Sort branches (each composes with the category/level filters):
    #   latest          publish-recency (default)
    #   hot             all-time in-app view_count (the weekly leaderboards under
    #                   /videos/rankings use behavior-event dedup instead)
    #   favorite        all-time favorite_count, the denormalized counter kept by
    #                   api/v1/favorites — never a COUNT(*) on the hot path
    #   weekly_favorite favorites created since this Monday 00:00 Asia/Shanghai.
    #                   The window comes from ranking_service so the feed and the
    #                   /videos/rankings weekly scopes agree on what 「本周」 means
    #                   (DEC-038); a LEFT JOIN keeps videos with no favorites this
    #                   week in the feed, ordered last.
    #
    # The two favorite sorts end with Video.id: favorite counts tie constantly
    # (most videos sit at 0), and without a unique last key OFFSET pagination can
    # repeat or skip rows across pages. latest/hot keep their historical ordering.
    stmt = select(Video).where(
        Video.is_official == True,
        Video.is_published == True,
        Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
    )
    if sort == "weekly_favorite":
        # Imported here, not at module level: ranking_service imports
        # channel_service, which imports _video_to_dict from this module — a
        # module-level import would close that cycle. Same reason _channel_slug_map
        # imports channel_service lazily.
        from app.services.ranking_service import current_week_start_utc

        weekly = (
            select(UserFavorite.video_id.label("video_id"), func.count().label("metric"))
            .where(UserFavorite.created_at >= current_week_start_utc())
            .group_by(UserFavorite.video_id)
            .subquery()
        )
        stmt = stmt.outerjoin(weekly, weekly.c.video_id == Video.id)
        order_by = [weekly.c.metric.desc().nullslast(), Video.created_at.desc(), Video.id.desc()]
    elif sort == "favorite":
        order_by = [Video.favorite_count.desc(), Video.created_at.desc(), Video.id.desc()]
    elif sort == "hot":
        order_by = [Video.view_count.desc(), Video.created_at.desc()]
    else:
        order_by = [Video.created_at.desc()]
    stmt = stmt.order_by(*order_by)

    # Filter by category (topic_tags stores comma-separated values)
    if category and category != "all":
        # Escape LIKE wildcards to prevent injection of % and _ patterns
        escaped = category.replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(Video.topic_tags.ilike(f"%{escaped}%", escape="\\"))

    # Filter by difficulty level (only when a specific level is requested)
    if level:
        stmt = stmt.where(Video.difficulty_level == level)

    # Count total for pagination
    count_stmt = select(func.count()).select_from(stmt.subquery())
    count_result = await db.execute(count_stmt)
    total = count_result.scalar_one()

    # Apply pagination
    offset = (page - 1) * page_size
    stmt = stmt.offset(offset).limit(page_size)

    result = await db.execute(stmt)
    videos = result.scalars().all()

    slug_map = await _channel_slug_map(db, videos)
    return paginated(
        [_video_to_dict(v, slug_map.get(v.channel_ref) if v.channel_ref else None) for v in videos],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/feed", response_model=PaginatedResponse)
@rate_limit("30/minute")
async def browse_feed(
    request: Request,
    db: AsyncSession = Depends(get_db),
    category: str = Query("all"),
    level: str | None = Query(None, max_length=2),
    sort: Literal["latest", "hot", "favorite", "weekly_favorite"] = Query("latest"),
    page: int = Query(1, ge=1, le=100),
    page_size: int = Query(20, ge=4, le=50),
):
    """Paginated content feed — browse local video library by category and difficulty.

    ``sort`` re-orders the whole feed (composes with category/level filters):
    ``latest`` = publish-recency (default), ``hot`` = all-time in-app views,
    ``favorite`` = all-time favorite count, ``weekly_favorite`` = favorites
    created since this Monday 00:00 Asia/Shanghai (same window as the
    ``weekly_favorites`` scope of ``/videos/rankings``).
    """
    return await _browse_feed_query(
        db=db,
        category=category,
        level=level,
        level_key=level or "all",
        sort=sort,
        page=page,
        page_size=page_size,
    )


@cached(ttl=300, key="browse:featured:{limit}")
async def _browse_featured_query(*, db: AsyncSession, limit: int) -> dict:
    """DB query for featured videos, cached by @cached."""
    stmt = (
        select(Video)
        .where(
            Video.show_on_homepage == True,
            Video.is_published == True,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
        .order_by(Video.created_at.desc())
        .limit(limit)
    )

    result = await db.execute(stmt)
    videos = result.scalars().all()

    slug_map = await _channel_slug_map(db, videos)
    return {
        "items": [_video_to_dict(v, slug_map.get(v.channel_ref) if v.channel_ref else None) for v in videos],
    }


@router.get("/featured")
@rate_limit("30/minute")
async def browse_featured(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(6, ge=1, le=100),
):
    """Return featured/highlighted videos for homepage hero section."""
    return await _browse_featured_query(db=db, limit=limit)


def _video_to_dict(v: Video, channel_slug: str | None = None) -> dict:
    """Convert a Video model to a dict for the feed response.

    ``channel_slug`` (author page link, ADR-0014 rev.) is passed in by callers
    that resolved the video's channel - keep it a parameter rather than a
    per-row query so paged feeds resolve slugs in one batch.
    """
    return {
        "id": v.id,
        "title": v.title,
        "thumbnail_url": v.thumbnail_url,
        "duration": v.duration,
        "difficulty_level": v.difficulty_level,
        "topic_tags": v.topic_tags,
        "is_official": v.is_official,
        "video_source": v.video_source.value if v.video_source else None,
        "channel_name": v.channel_name,
        "channel_slug": channel_slug,
        "like_count": v.like_count,
        "favorite_count": v.favorite_count,
        # In-app totals shown on cards (distinct from ext_* YouTube counters).
        "view_count": v.view_count,
        # Truncated YouTube blurb for the card subtitle; null for local videos.
        "description": v.description[:CARD_DESCRIPTION_LIMIT] if v.description else None,
        "status": v.status.value if v.status else None,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


async def _channel_slug_map(db: AsyncSession, videos) -> dict[str, str]:
    """channel_ref -> slug for a page of videos (author-page card links)."""
    from app.services.channel_service import channel_slugs_for

    return await channel_slugs_for(db, videos)


async def invalidate_browse_cache() -> None:
    """Invalidate all browse feed caches.

    Thin pass-through to the service layer (app.services.video_cache) so the
    authoritative implementation lives outside the API route module.  Service
    and task layers should import from video_cache directly, not from here.
    """
    from app.services.video_cache import invalidate_browse_cache as _invalidate

    await _invalidate()

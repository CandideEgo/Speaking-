"""Browse channel — browse local video library by category and difficulty."""

from typing import Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cached
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.favorite import UserFavorite
from app.models.video import Video, VideoStatus
from app.schemas.browse import CategoriesResponse, FeaturedVideosResponse
from app.schemas.pagination import PaginatedResponse, paginated
from app.schemas.video import VideoResponse
from app.services.ranking_service import current_week_start_utc
from app.services.video_card import CARD_SHAPE_VERSION, video_card_payload
from app.services.video_classification import TOPIC_CATEGORIES

logger = structlog.get_logger()

router = APIRouter(prefix="/browse", tags=["browse"])

# Canonical taxonomy lives in services/video_classification (the LLM
# whitelist is derived from the same list — they must not drift).
# Shallow copy so endpoint consumers can't mutate the service-level source.
CATEGORIES: list[dict] = [dict(c) for c in TOPIC_CATEGORIES]


@router.get("/categories", response_model=CategoriesResponse)
@rate_limit("30/minute")
async def list_categories(request: Request):
    """Return available content categories."""
    return {"categories": CATEGORIES}


@cached(
    ttl=300,
    key=(
        f"browse:feed:v{CARD_SHAPE_VERSION}:{{category}}:{{level_key}}:{{sort}}:{{duration_key}}:{{page}}:{{page_size}}"
    ),
)
async def _browse_feed_query(
    *,
    db: AsyncSession,
    category: str,
    level: str | None,
    level_key: str,
    sort: str,
    duration_min: int | None,
    duration_max: int | None,
    duration_key: str,
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

    # Duration buckets (seconds). Videos without a duration can't satisfy a
    # duration filter, so they drop out only when one is requested.
    if duration_min is not None:
        stmt = stmt.where(Video.duration.is_not(None), Video.duration >= duration_min)
    if duration_max is not None:
        stmt = stmt.where(Video.duration.is_not(None), Video.duration <= duration_max)

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
        [video_card_payload(v, slug_map.get(v.channel_ref) if v.channel_ref else None) for v in videos],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/feed", response_model=PaginatedResponse[VideoResponse])
@rate_limit("30/minute")
async def browse_feed(
    request: Request,
    db: AsyncSession = Depends(get_db),
    category: str = Query("all"),
    level: str | None = Query(None, max_length=2),
    sort: Literal["latest", "hot", "favorite", "weekly_favorite"] = Query("latest"),
    duration_min: int | None = Query(None, ge=0, le=86400),
    duration_max: int | None = Query(None, ge=0, le=86400),
    page: int = Query(1, ge=1, le=100),
    page_size: int = Query(20, ge=4, le=50),
):
    """Paginated content feed — browse local video library by category and difficulty.

    ``sort`` re-orders the whole feed (composes with category/level filters):
    ``latest`` = publish-recency (default), ``hot`` = all-time in-app views,
    ``favorite`` = all-time favorite count, ``weekly_favorite`` = favorites
    created since this Monday 00:00 Asia/Shanghai (same window as the
    ``weekly_favorites`` scope of ``/videos/rankings``).
    ``duration_min`` / ``duration_max`` filter by media length in seconds.
    """
    if duration_min is not None and duration_max is not None and duration_min > duration_max:
        raise HTTPException(status_code=400, detail="duration_min 不能大于 duration_max")
    duration_key = (
        f"{duration_min if duration_min is not None else ''}-{duration_max if duration_max is not None else ''}"
        if duration_min is not None or duration_max is not None
        else "all"
    )
    return await _browse_feed_query(
        db=db,
        category=category,
        level=level,
        level_key=level or "all",
        sort=sort,
        duration_min=duration_min,
        duration_max=duration_max,
        duration_key=duration_key,
        page=page,
        page_size=page_size,
    )


@cached(ttl=300, key=f"browse:featured:v{CARD_SHAPE_VERSION}:{{limit}}")
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
        "items": [video_card_payload(v, slug_map.get(v.channel_ref) if v.channel_ref else None) for v in videos],
    }


@router.get("/featured", response_model=FeaturedVideosResponse)
@rate_limit("30/minute")
async def browse_featured(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(6, ge=1, le=100),
):
    """Return featured/highlighted videos for homepage hero section."""
    return await _browse_featured_query(db=db, limit=limit)


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

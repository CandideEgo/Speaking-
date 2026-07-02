"""Browse channel — browse local video library by category and difficulty."""

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cached
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.video import Video, VideoStatus

logger = structlog.get_logger()

router = APIRouter(prefix="/browse", tags=["browse"])

CATEGORIES: list[dict] = [
    {"id": "all", "label": "All"},
    {"id": "ted", "label": "TED Talks"},
    {"id": "interview", "label": "Interviews"},
    {"id": "news", "label": "News"},
    {"id": "vlog", "label": "Vlogs"},
    {"id": "educational", "label": "Educational"},
    {"id": "movie", "label": "Movie Clips"},
    {"id": "tech", "label": "Tech"},
    {"id": "speech", "label": "Speeches"},
]


@router.get("/categories")
@rate_limit("30/minute")
async def list_categories(request: Request):
    """Return available content categories."""
    return {"categories": CATEGORIES}


@cached(ttl=300, key="browse:feed:{category}:{level_key}:{page}:{page_size}")
async def _browse_feed_query(
    *,
    db: AsyncSession,
    category: str,
    level: str | None,
    level_key: str,
    page: int,
    page_size: int,
) -> dict:
    """DB query for browse feed, cached by @cached."""
    # Base query: official, published, ready videos
    stmt = (
        select(Video)
        .where(
            Video.is_official == True,
            Video.is_published == True,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
        .order_by(Video.created_at.desc())
    )

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

    cat = next((c for c in CATEGORIES if c["id"] == category), CATEGORIES[0])

    return {
        "items": [_video_to_dict(v) for v in videos],
        "category": cat,
        "page": page,
        "page_size": page_size,
        "total": total,
        "has_more": total > page * page_size,
    }


@router.get("/feed")
@rate_limit("30/minute")
async def browse_feed(
    request: Request,
    db: AsyncSession = Depends(get_db),
    category: str = Query("all"),
    level: str | None = Query(None, max_length=2),
    page: int = Query(1, ge=1, le=100),
    page_size: int = Query(20, ge=4, le=50),
):
    """Paginated content feed — browse local video library by category and difficulty."""
    return await _browse_feed_query(
        db=db,
        category=category,
        level=level,
        level_key=level or "all",
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

    return {
        "items": [_video_to_dict(v) for v in videos],
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


def _video_to_dict(v: Video) -> dict:
    """Convert a Video model to a dict for the feed response."""
    return {
        "id": v.id,
        "title": v.title,
        "thumbnail_url": v.thumbnail_url,
        "duration": v.duration,
        "difficulty_level": v.difficulty_level,
        "topic_tags": v.topic_tags,
        "is_official": v.is_official,
        "video_source": v.video_source.value if v.video_source else None,
        "like_count": v.like_count,
        "favorite_count": v.favorite_count,
        "status": v.status.value if v.status else None,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


async def invalidate_browse_cache() -> None:
    """Invalidate all browse feed caches.

    Thin pass-through to the service layer (app.services.video_cache) so the
    authoritative implementation lives outside the API route module.  Service
    and task layers should import from video_cache directly, not from here.
    """
    from app.services.video_cache import invalidate_browse_cache as _invalidate

    await _invalidate()

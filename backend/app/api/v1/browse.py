"""Browse channel — browse local video library by category and difficulty."""

import json

import structlog
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_delete, cache_get, cache_set
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
    # Check cache first
    cache_key = f"browse:feed:{category}:{level or 'all'}:{page}:{page_size}"
    cached = await cache_get(cache_key)
    if cached:
        return json.loads(cached)

    # Base query: official, ready videos
    stmt = (
        select(Video)
        .where(
            Video.is_official == True,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
        .order_by(Video.created_at.desc())
    )

    # Filter by category (topic_tags stores comma-separated values)
    if category and category != "all":
        stmt = stmt.where(Video.topic_tags.ilike(f"%{category}%"))

    # Filter by difficulty level
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

    response = {
        "items": [_video_to_dict(v) for v in videos],
        "category": cat,
        "page": page,
        "page_size": page_size,
        "total": total,
        "has_more": total > page * page_size,
    }

    # Cache for 5 minutes
    await cache_set(cache_key, json.dumps(response, ensure_ascii=False), ttl=300)
    return response


@router.get("/featured")
@rate_limit("30/minute")
async def browse_featured(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(6, ge=1, le=12),
):
    """Return featured/highlighted videos for homepage hero section."""
    cache_key = f"browse:featured:{limit}"
    cached = await cache_get(cache_key)
    if cached:
        return json.loads(cached)

    stmt = (
        select(Video)
        .where(
            Video.is_official == True,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
        .order_by(Video.created_at.desc())
        .limit(limit)
    )

    result = await db.execute(stmt)
    videos = result.scalars().all()

    response = {
        "items": [_video_to_dict(v) for v in videos],
    }

    # Cache for 5 minutes
    await cache_set(cache_key, json.dumps(response, ensure_ascii=False), ttl=300)
    return response


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
        "status": v.status.value if v.status else None,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


async def invalidate_browse_cache() -> None:
    """Invalidate all browse feed caches.

    Call this when videos are added/updated (e.g. seed script, video processing completion).
    """
    await cache_delete("browse:feed:*")
    await cache_delete("browse:featured:*")

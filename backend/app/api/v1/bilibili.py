"""Bilibili channel — curated English-learning content feeds."""

import json
import structlog
from datetime import datetime

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.feed_base import FeedConfig, create_feed_router, _cache_get, _cache_set
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.video import Video, VideoStatus

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

from pydantic import BaseModel


class HotTagResponse(BaseModel):
    tag: str
    count: int


class RankingItemResponse(BaseModel):
    id: str
    title: str
    thumbnail: str | None
    difficulty: str | None
    created_at: str

    model_config = {"from_attributes": True}


class BannerItemResponse(BaseModel):
    id: str
    title: str
    thumbnail: str | None
    link: str


# ---------------------------------------------------------------------------
# Router — feed routes from factory + custom aggregation routes
# ---------------------------------------------------------------------------

router = create_feed_router(FeedConfig(
    prefix="/bilibili",
    tag="bilibili",
    feed_doc="Paginated content feed — Bilibili-style curated English learning videos.",
    error_label="Bilibili",
    categories=[
        {"id": "all", "label": "首页", "query": "English speaking practice"},
        {"id": "spoken", "label": "口语练习", "query": "English speaking practice daily"},
        {"id": "interview", "label": "面试英语", "query": "English interview preparation"},
        {"id": "travel", "label": "旅行英语", "query": "travel English conversation"},
        {"id": "business", "label": "商务英语", "query": "business English meeting"},
        {"id": "culture", "label": "文化差异", "query": "cultural differences English"},
        {"id": "daily", "label": "日常对话", "query": "daily English conversation"},
    ],
))


# ---------------------------------------------------------------------------
# Hot Tags — aggregate topic_tags from official ready videos
# ---------------------------------------------------------------------------

@router.get("/hot-tags")
@rate_limit("30/minute")
async def hot_tags(request: Request, db: AsyncSession = Depends(get_db)):
    """Return top 10 topic tags by frequency across official ready videos."""
    cache_key = "bilibili:hot-tags"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return {"tags": cached}

    # Query official ready videos that have topic_tags
    result = await db.execute(
        select(Video.topic_tags)
        .where(
            Video.is_official == True,
            Video.status == VideoStatus.ready,
            Video.topic_tags.isnot(None),
            Video.topic_tags != "",
        )
    )
    rows = result.scalars().all()

    # Count tag frequencies
    tag_counts: dict[str, int] = {}
    for raw in rows:
        try:
            tags = json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, TypeError):
            # Handle comma-separated fallback
            tags = [t.strip() for t in raw.split(",") if t.strip()] if isinstance(raw, str) else []
        for tag in tags:
            tag = tag.strip()
            if tag:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

    # Sort by count descending, take top 10
    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    items = [{"tag": t, "count": c} for t, c in sorted_tags]

    await _cache_set(cache_key, items)
    return {"tags": items}


# ---------------------------------------------------------------------------
# Rankings — recent official ready videos as popularity proxy
# ---------------------------------------------------------------------------

@router.get("/rankings")
@rate_limit("30/minute")
async def rankings(request: Request, db: AsyncSession = Depends(get_db)):
    """Return top 10 official ready videos ordered by created_at desc."""
    cache_key = "bilibili:rankings"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return {"rankings": cached}

    result = await db.execute(
        select(Video)
        .where(
            Video.is_official == True,
            Video.status == VideoStatus.ready,
        )
        .order_by(Video.created_at.desc())
        .limit(10)
    )
    videos = result.scalars().all()

    items = []
    for v in videos:
        created = v.created_at
        created_str = created.isoformat() if isinstance(created, datetime) else str(created)
        items.append({
            "id": v.id,
            "title": v.title,
            "thumbnail": v.thumbnail_url,
            "difficulty": v.difficulty_level,
            "created_at": created_str,
        })

    await _cache_set(cache_key, items)
    return {"rankings": items}


# ---------------------------------------------------------------------------
# Banners — 3 most recent official ready videos as banner items
# ---------------------------------------------------------------------------

@router.get("/banners")
@rate_limit("30/minute")
async def banners(request: Request, db: AsyncSession = Depends(get_db)):
    """Return 3 most recent official ready videos as banner items."""
    cache_key = "bilibili:banners"
    cached = await _cache_get(cache_key)
    if cached is not None:
        return {"banners": cached}

    result = await db.execute(
        select(Video)
        .where(
            Video.is_official == True,
            Video.status == VideoStatus.ready,
        )
        .order_by(Video.created_at.desc())
        .limit(3)
    )
    videos = result.scalars().all()

    items = []
    for v in videos:
        items.append({
            "id": v.id,
            "title": v.title,
            "thumbnail": v.thumbnail_url,
            "link": f"/watch/{v.id}",
        })

    await _cache_set(cache_key, items)
    return {"banners": items}

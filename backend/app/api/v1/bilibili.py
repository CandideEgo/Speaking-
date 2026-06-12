"""Bilibili channel — curated English-learning content feeds."""

import logging
import time
from typing import Optional

from fastapi import APIRouter, Query

from app.services.youtube_service import search_youtube

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bilibili", tags=["bilibili"])

CATEGORIES: list[dict] = [
    {"id": "all", "label": "首页", "query": "English speaking practice"},
    {"id": "spoken", "label": "口语练习", "query": "English speaking practice daily"},
    {"id": "interview", "label": "面试英语", "query": "English interview preparation"},
    {"id": "travel", "label": "旅行英语", "query": "travel English conversation"},
    {"id": "business", "label": "商务英语", "query": "business English meeting"},
    {"id": "culture", "label": "文化差异", "query": "cultural differences English"},
    {"id": "daily", "label": "日常对话", "query": "daily English conversation"},
]

_cache: dict[str, tuple[list[dict], float]] = {}
_CACHE_TTL = 600
_MAX_CACHE_ENTRIES = 100


def _clean_expired_cache():
    now = time.time()
    expired = [k for k, (_, ts) in _cache.items() if now - ts >= _CACHE_TTL]
    for k in expired:
        del _cache[k]


@router.get("/categories")
async def list_categories():
    return {"categories": CATEGORIES}


@router.get("/feed")
async def bilibili_feed(
    category: str = Query("all"),
    page: int = Query(1, ge=1, le=10),
    page_size: int = Query(20, ge=4, le=50),
):
    """Paginated content feed — Bilibili-style curated English learning videos."""
    cat = next((c for c in CATEGORIES if c["id"] == category), CATEGORIES[0])
    query = cat["query"]

    _clean_expired_cache()
    cache_key = f"{category}:{page}"
    if cache_key in _cache:
        items, ts = _cache[cache_key]
        if time.time() - ts < _CACHE_TTL:
            return {"items": items, "category": cat, "page": page, "has_more": len(items) >= page_size}

    try:
        items = await search_youtube(query, page_size=page_size)
    except Exception:
        logger.exception("Bilibili feed search failed")
        return {"items": [], "category": cat, "page": page, "has_more": False,
                "error": "Search temporarily unavailable"}

    if len(_cache) >= _MAX_CACHE_ENTRIES:
        oldest = min(_cache, key=lambda k: _cache[k][1])
        del _cache[oldest]
    _cache[cache_key] = (items, time.time())
    return {"items": items, "category": cat, "page": page, "has_more": len(items) >= page_size}

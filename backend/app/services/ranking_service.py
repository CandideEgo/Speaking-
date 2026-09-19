"""Home rankings service — 「最新」/ 周播放 / 周收藏榜单.

Three scopes, each a top-20 list of video cards for the homepage rankings
module (GET /api/v1/videos/rankings):

- ``latest``: visible videos ordered by first-publish ``published_at`` DESC,
  NULLs last (created_at DESC tiebreak keeps pre-backfill rows stable).
- ``weekly_views``: behavior_events with event_type IN ('play','complete')
  since Monday 00:00 Asia/Shanghai of the **current calendar week**, grouped
  by video_id, metric = COUNT(DISTINCT COALESCE(session_id, 'row:'||id)) —
  the session_id dedup is the anti-fraud rule from the product spec; events
  without a session_id count individually via a synthetic per-row key.
- ``weekly_favorites``: user_favorites.created_at since Monday 00:00
  Asia/Shanghai of the current calendar week, grouped by video_id,
  metric = COUNT(*).

Reads are cache read-through under ``rankings:snapshot:{scope}`` (TTL
``rankings_snapshot_ttl_seconds``), refreshed daily by the
``snapshot_rankings`` beat task just after local midnight
(app.tasks.ranking_tasks). Redis is fail-open: a miss or outage just falls
through to the database.
"""

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import String, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get_json, cache_set_json
from app.core.config import get_settings
from app.models.behavior import BehaviorEvent
from app.models.favorite import UserFavorite
from app.models.video import Video, VideoSource, VideoStatus
from app.services.channel_service import channel_slugs_for

RANKING_SCOPES: tuple[str, ...] = ("latest", "weekly_views", "weekly_favorites")
_RANKING_LIMIT = 20

# 周榜按自然周切分（需求 §3.1「本周」，2026-09 决策）：面向中文用户，以北京时间
# 周一 00:00 为周界。中国不实行夏令时，固定 UTC+8 比 zoneinfo 更省心（无需 tzdata）。
_CST = timezone(timedelta(hours=8))


def current_week_start_utc(now: datetime | None = None) -> datetime:
    """Lower bound of the weekly scopes: this Monday 00:00 Asia/Shanghai as UTC."""
    now_cst = (now or datetime.now(UTC)).astimezone(_CST)
    monday_cst = (now_cst - timedelta(days=now_cst.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return monday_cst.astimezone(UTC)


# Visibility triple (same convention as browse.list_public_videos): official +
# published + ready. UGC/private videos never appear on home rankings.
_VISIBILITY_FILTER = (
    Video.is_official == True,
    Video.is_published == True,
    Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
)


def rankings_cache_key(scope: str) -> str:
    """Redis key for a scope's snapshot (written by the beat task, read here)."""
    return f"rankings:snapshot:{scope}"


async def get_rankings(db: AsyncSession, scope: str) -> list[dict[str, Any]]:
    """Return up to 20 ranked video cards for ``scope`` (cache read-through)."""
    cached = await cache_get_json(rankings_cache_key(scope))
    if isinstance(cached, list):
        return cached

    items = await compute_rankings(db, scope)
    ttl = get_settings().rankings_snapshot_ttl_seconds
    await cache_set_json(rankings_cache_key(scope), items, ttl=ttl)
    return items


async def compute_rankings(db: AsyncSession, scope: str) -> list[dict[str, Any]]:
    """Compute a scope's ranking straight from the database (no cache I/O)."""
    if scope == "latest":
        return await _latest_rankings(db)
    if scope == "weekly_views":
        return await _weekly_views_rankings(db)
    return await _weekly_favorites_rankings(db)


async def _latest_rankings(db: AsyncSession) -> list[dict[str, Any]]:
    """Newest visible videos by first-publish timestamp (NULLs last)."""
    rows = (
        (
            await db.execute(
                select(Video)
                .where(*_VISIBILITY_FILTER)
                .order_by(Video.published_at.desc().nullslast(), Video.created_at.desc())
                .limit(_RANKING_LIMIT)
            )
        )
        .scalars()
        .all()
    )
    return await _serialize(db, [(v, None) for v in rows])


async def _weekly_views_rankings(db: AsyncSession) -> list[dict[str, Any]]:
    """Top 20 visible videos by deduped play/complete sessions this week."""
    since = current_week_start_utc()
    # Anti-fraud dedup (product spec): each session counts once per video;
    # session-less events count individually via a synthetic per-row key.
    row_key = func.coalesce(
        BehaviorEvent.session_id,
        literal("row:").concat(BehaviorEvent.id.cast(String)),
    )
    metric = func.count(func.distinct(row_key))
    subq = (
        select(BehaviorEvent.video_id.label("video_id"), metric.label("metric"))
        .where(
            BehaviorEvent.event_type.in_(["play", "complete"]),
            BehaviorEvent.server_ts >= since,
            BehaviorEvent.video_id.isnot(None),
        )
        .group_by(BehaviorEvent.video_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(Video, subq.c.metric)
            .join(subq, subq.c.video_id == Video.id)
            .where(*_VISIBILITY_FILTER)
            .order_by(subq.c.metric.desc(), Video.created_at.desc())
            .limit(_RANKING_LIMIT)
        )
    ).all()
    return await _serialize(db, [(v, metric) for v, metric in rows])


async def _weekly_favorites_rankings(db: AsyncSession) -> list[dict[str, Any]]:
    """Top 20 visible videos by user_favorites created this week."""
    since = current_week_start_utc()
    subq = (
        select(UserFavorite.video_id.label("video_id"), func.count().label("metric"))
        .where(UserFavorite.created_at >= since)
        .group_by(UserFavorite.video_id)
        .subquery()
    )
    rows = (
        await db.execute(
            select(Video, subq.c.metric)
            .join(subq, subq.c.video_id == Video.id)
            .where(*_VISIBILITY_FILTER)
            .order_by(subq.c.metric.desc(), Video.created_at.desc())
            .limit(_RANKING_LIMIT)
        )
    ).all()
    return await _serialize(db, [(v, metric) for v, metric in rows])


async def _serialize(db: AsyncSession, rows: Sequence[tuple[Video, Any]]) -> list[dict[str, Any]]:
    """(Video, metric) rows → card dicts (browse feed shape + view/published/metric)."""
    videos = [v for v, _ in rows]
    slug_map = await channel_slugs_for(db, videos)
    items: list[dict[str, Any]] = []
    for v, metric in rows:
        items.append(
            {
                "id": v.id,
                "title": v.title,
                "thumbnail_url": v.thumbnail_url,
                "duration": v.duration,
                "difficulty_level": v.difficulty_level,
                "topic_tags": v.topic_tags,
                "is_official": v.is_official,
                "video_source": (v.video_source.value if isinstance(v.video_source, VideoSource) else v.video_source),
                "channel_name": v.channel_name,
                "channel_slug": slug_map.get(v.channel_ref) if v.channel_ref else None,
                "like_count": v.like_count,
                "favorite_count": v.favorite_count,
                "status": v.status.value if v.status else None,
                "created_at": v.created_at.isoformat() if v.created_at else None,
                "view_count": v.view_count,
                "published_at": v.published_at.isoformat() if v.published_at else None,
                "metric": metric,
            }
        )
    return items

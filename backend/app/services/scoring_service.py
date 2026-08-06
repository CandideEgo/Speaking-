"""Video scoring service — P1 learning_score (ADR-0011) + 阶段 2 external factors.

Computes a 0-100 ``learning_score`` per video from 7 weighted factors
(+ additive bonus), persists the breakdown to ``video_scores`` and the
denormalized total to ``videos.score``. Weights + saturation benchmarks are
configurable (``Settings.score_*``). No-data factors (CTR/Retention/WatchTime/
Viral/Freshness) stay 0; TopicMatch/Quality/Bonus give new videos a non-zero
baseline so freshly-finalized videos aren't buried at 0.

阶段 2 external-signal factors (require 阶段 1 backfilled columns):
- ``viral``: ``ext_view_count`` vs the channel's average views (log-scaled;
  10x over-performing → 0.5, 100x → 1.0). Below-average videos score 0.
- ``freshness``: views-per-day since YouTube ``upload_date`` vs a benchmark —
  10天100万播放 beats 5年1000万播放.

Not a recommendation engine — this is the per-video quality/popularity signal
that ``list_public_videos`` sorts by. Personalization lives in
recommendation_service (P2). See LAUNCH-SPRINT-2026-07 阶段 4.
"""

import math
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.behavior import BehaviorEvent
from app.models.learning import LearningRecord
from app.models.subtitle import Subtitle
from app.models.video import Video
from app.models.video_score import VideoScore


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def _ensure_aware(dt: datetime) -> datetime:
    """Tag a naive datetime with UTC (SQLite returns naive, Postgres aware)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


async def _factor_ctr(db: AsyncSession, video_id: str, benchmark: int) -> float:
    """Click-through proxy: min(clicks / benchmark, 1). No clicks → 0."""
    clicks = await db.scalar(
        select(func.count())
        .select_from(BehaviorEvent)
        .where(BehaviorEvent.video_id == video_id, BehaviorEvent.event_type == "click")
    )
    clicks = clicks or 0
    if clicks <= 0 or benchmark <= 0:
        return 0.0
    return _clamp(clicks / benchmark)


async def _factor_retention(db: AsyncSession, video_id: str) -> float:
    """Avg progress_percentage / 100 across viewers. No records → 0."""
    avg = await db.scalar(
        select(func.avg(LearningRecord.progress_percentage)).where(LearningRecord.video_id == video_id)
    )
    if not avg:
        return 0.0
    return _clamp(float(avg) / 100.0)


async def _factor_watch_time(db: AsyncSession, video_id: str, benchmark: int) -> float:
    """min(Σ time_spent_seconds / benchmark, 1). No data → 0."""
    total = await db.scalar(
        select(func.sum(LearningRecord.time_spent_seconds)).where(LearningRecord.video_id == video_id)
    )
    total = total or 0
    if total <= 0 or benchmark <= 0:
        return 0.0
    return _clamp(float(total) / benchmark)


def _factor_topic_match(video: Video, has_subtitles: bool) -> float:
    """Metadata completeness: (tags + difficulty + duration + subtitles) / 4.

    Always computable; the factor that gives a new video its baseline before
    behavior data accrues. (The practice-question check was removed when the
    试题功能 went offline — 2026-08.)
    """
    checks = [
        bool(video.topic_tags and video.topic_tags.strip()),
        bool(video.difficulty_level),
        video.duration is not None and video.duration > 0,
        has_subtitles,
    ]
    return sum(1 for c in checks if c) / 4.0


async def _subtitle_stats(db: AsyncSession, video_id: str) -> tuple[int, int]:
    """Return (total_subtitles, translated_subtitles) for a video."""
    total = await db.scalar(select(func.count()).select_from(Subtitle).where(Subtitle.video_id == video_id))
    total = total or 0
    if total == 0:
        return 0, 0
    translated = await db.scalar(
        select(func.count())
        .select_from(Subtitle)
        .where(
            Subtitle.video_id == video_id,
            Subtitle.text_zh.isnot(None),
            Subtitle.text_zh != "",
        )
    )
    return total, (translated or 0)


async def _factor_viral(db: AsyncSession, video: Video) -> float:
    """爆发指数: ``ext_view_count`` vs channel average, log-scaled.

    Baseline = average ``ext_view_count`` of the same ``channel_id`` in the
    library (≥2 samples); falls back to the whole-library average when the
    channel has fewer samples. ratio ≤ 1 → 0; 10x → 0.5; ≥100x → 1.0.
    No external data → 0 (local videos aren't penalized relative to each
    other — they all stay 0 here).
    """
    views = video.ext_view_count
    if not views or views <= 0:
        return 0.0

    baseline: float | None = None
    if video.channel_id:
        sample = await db.scalar(
            select(func.count())
            .select_from(Video)
            .where(Video.channel_id == video.channel_id, Video.ext_view_count.is_not(None))
        )
        if (sample or 0) >= 2:
            baseline = await db.scalar(
                select(func.avg(Video.ext_view_count)).where(
                    Video.channel_id == video.channel_id, Video.ext_view_count.is_not(None)
                )
            )
    if baseline is None:
        baseline = await db.scalar(select(func.avg(Video.ext_view_count)).where(Video.ext_view_count.is_not(None)))
    if not baseline or baseline <= 0:
        return 0.0

    ratio = views / float(baseline)
    if ratio <= 1.0:
        return 0.0
    return _clamp(math.log10(ratio) / 2.0)


def _factor_freshness(video: Video, vpd_benchmark: int) -> float:
    """热度增长速度: views-per-day since ``upload_date`` vs benchmark.

    ``ext_view_count / days_since_upload`` clamped at ``vpd_benchmark``.
    Missing external data → 0.
    """
    views = video.ext_view_count
    if not views or views <= 0 or video.upload_date is None or vpd_benchmark <= 0:
        return 0.0
    days = max((datetime.now(UTC) - _ensure_aware(video.upload_date)).days, 1)
    vpd = views / days
    return _clamp(vpd / vpd_benchmark)


async def compute_video_score(db: AsyncSession, video_id: str) -> dict | None:
    """Compute + persist the 7-factor (+bonus) learning_score for a video.

    Returns the breakdown dict (or ``None`` if the video doesn't exist). Writes
    a new ``video_scores`` row and updates ``videos.score`` /
    ``videos.score_updated_at``. Safe to call on any video regardless of status.
    """
    video = await db.scalar(select(Video).where(Video.id == video_id))
    if video is None:
        return None

    s = get_settings()
    sub_total, sub_translated = await _subtitle_stats(db, video_id)
    has_sub = sub_total > 0

    ctr = await _factor_ctr(db, video_id, s.score_ctr_click_benchmark)
    retention = await _factor_retention(db, video_id)
    watch_time = await _factor_watch_time(db, video_id, s.score_watch_time_benchmark)
    topic_match = _factor_topic_match(video, has_sub)
    quality = (sub_translated / sub_total) if sub_total > 0 else 0.0
    viral = await _factor_viral(db, video)
    freshness = _factor_freshness(video, s.score_freshness_vpd_benchmark)
    bonus = 1.0 if video.is_official else 0.0

    base = (
        s.score_weight_ctr * ctr
        + s.score_weight_retention * retention
        + s.score_weight_watch_time * watch_time
        + s.score_weight_topic_match * topic_match
        + s.score_weight_quality * quality
        + s.score_weight_viral * viral
        + s.score_weight_freshness * freshness
    ) * 100.0
    total = min(100.0, base + s.score_bonus_points * bonus)

    now = datetime.now(UTC)
    db.add(
        VideoScore(
            video_id=video_id,
            total_score=round(total, 2),
            ctr=round(ctr, 4),
            retention=round(retention, 4),
            watch_time=round(watch_time, 4),
            topic_match=round(topic_match, 4),
            quality=round(quality, 4),
            viral=round(viral, 4),
            freshness=round(freshness, 4),
            bonus=bonus,
            computed_at=now,
        )
    )
    video.score = round(total, 2)
    video.score_updated_at = now
    await db.commit()

    return {
        "video_id": video_id,
        "total_score": round(total, 2),
        "factors": {
            "ctr": round(ctr, 4),
            "retention": round(retention, 4),
            "watch_time": round(watch_time, 4),
            "topic_match": round(topic_match, 4),
            "quality": round(quality, 4),
            "viral": round(viral, 4),
            "freshness": round(freshness, 4),
            "bonus": bonus,
        },
        "weights": {
            "ctr": s.score_weight_ctr,
            "retention": s.score_weight_retention,
            "watch_time": s.score_weight_watch_time,
            "topic_match": s.score_weight_topic_match,
            "quality": s.score_weight_quality,
            "viral": s.score_weight_viral,
            "freshness": s.score_weight_freshness,
            "bonus_points": s.score_bonus_points,
        },
        "computed_at": now.isoformat(),
    }


async def get_latest_score(db: AsyncSession, video_id: str) -> VideoScore | None:
    """Latest ``VideoScore`` row for a video (or ``None`` if never scored)."""
    result = await db.execute(
        select(VideoScore).where(VideoScore.video_id == video_id).order_by(VideoScore.computed_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()

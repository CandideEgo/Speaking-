"""Video scoring service — P1 learning_score (ADR-0011).

Computes a 0-100 ``learning_score`` per video from 6 factors, persists the
breakdown to ``video_scores`` and the denormalized total to ``videos.score``.
Weights + saturation benchmarks are configurable (``Settings.score_*``). No-data
factors (CTR/Retention/WatchTime) stay 0; TopicMatch/Quality/Bonus give new
videos a non-zero baseline so freshly-finalized videos aren't buried at 0.

Not a recommendation engine — this is the per-video quality/popularity signal
that ``list_public_videos`` sorts by. Personalization lives in
recommendation_service (P2). See LAUNCH-SPRINT-2026-07 阶段 4.
"""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.behavior import BehaviorEvent
from app.models.learning import LearningRecord
from app.models.practice import VideoPracticeQuestion
from app.models.subtitle import Subtitle
from app.models.video import Video
from app.models.video_score import VideoScore


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


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


def _factor_topic_match(video: Video, has_subtitles: bool, has_practice: bool) -> float:
    """Metadata completeness: (tags + difficulty + duration + subtitles + practice) / 5.

    Always computable; the factor that gives a new video its baseline before
    behavior data accrues.
    """
    checks = [
        bool(video.topic_tags and video.topic_tags.strip()),
        bool(video.difficulty_level),
        video.duration is not None and video.duration > 0,
        has_subtitles,
        has_practice,
    ]
    return sum(1 for c in checks if c) / 5.0


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


async def _has_practice(db: AsyncSession, video_id: str) -> bool:
    cnt = await db.scalar(
        select(func.count()).select_from(VideoPracticeQuestion).where(VideoPracticeQuestion.video_id == video_id)
    )
    return bool(cnt)


async def compute_video_score(db: AsyncSession, video_id: str) -> dict | None:
    """Compute + persist the 6-factor learning_score for a video.

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
    has_prac = await _has_practice(db, video_id)

    ctr = await _factor_ctr(db, video_id, s.score_ctr_click_benchmark)
    retention = await _factor_retention(db, video_id)
    watch_time = await _factor_watch_time(db, video_id, s.score_watch_time_benchmark)
    topic_match = _factor_topic_match(video, has_sub, has_prac)
    quality = (sub_translated / sub_total) if sub_total > 0 else 0.0
    bonus = 1.0 if (video.is_official or has_prac) else 0.0

    base = (
        s.score_weight_ctr * ctr
        + s.score_weight_retention * retention
        + s.score_weight_watch_time * watch_time
        + s.score_weight_topic_match * topic_match
        + s.score_weight_quality * quality
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
            "bonus": bonus,
        },
        "weights": {
            "ctr": s.score_weight_ctr,
            "retention": s.score_weight_retention,
            "watch_time": s.score_weight_watch_time,
            "topic_match": s.score_weight_topic_match,
            "quality": s.score_weight_quality,
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

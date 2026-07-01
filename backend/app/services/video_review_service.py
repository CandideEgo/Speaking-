"""UGC video review lifecycle — state machine for draft/pending/published/rejected.

Manages the snapshot freeze/restore mechanism that lets owners edit their
video while the public keeps watching the last approved version.
"""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import commit_refresh
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus
from app.schemas.video import SubtitleResponse
from app.services.video_cache import invalidate_video_detail_cache

_SNAPSHOT_VERSION = 1


def subtitles_from_snapshot(snapshot: dict | None) -> list[SubtitleResponse]:
    """Build SubtitleResponse list from a frozen published_snapshot."""
    if not snapshot:
        return []
    raw = snapshot.get("subtitles") or []
    out: list[SubtitleResponse] = []
    for s in raw:
        out.append(
            SubtitleResponse(
                id=s.get("id", ""),
                start_time=s.get("start_time", 0.0),
                end_time=s.get("end_time", 0.0),
                text_en=s.get("text_en", ""),
                text_zh=s.get("text_zh"),
                sentence_index=s.get("sentence_index", 0),
                grammar_note=s.get("grammar_note"),
                speaker=s.get("speaker"),
                word_levels=s.get("word_levels"),
            )
        )
    return out


async def _build_snapshot(db: AsyncSession, video: Video) -> dict:
    """Freeze the current live subtitles + practice sets into a snapshot dict.

    The snapshot is what the public keeps watching while the owner edits a
    pending/rejected draft. Practice questions are stored per exam level so the
    practice GET can serve the approved version during re-review.
    """
    result = await db.execute(select(Video).options(selectinload(Video.subtitles)).where(Video.id == video.id))
    loaded = result.scalar_one_or_none()
    subs = loaded.subtitles if loaded else []

    # Freeze every cached practice set, keyed by exam level.
    from app.models.practice import VideoPracticeQuestion

    pq_result = await db.execute(select(VideoPracticeQuestion).where(VideoPracticeQuestion.video_id == video.id))
    practice_by_level: dict[str, list] = {}
    for pq in pq_result.scalars().all():
        practice_by_level[pq.exam_level] = pq.questions or []

    return {
        "version": _SNAPSHOT_VERSION,
        "subtitles": [
            {
                "id": s.id,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "text_en": s.text_en,
                "text_zh": s.text_zh,
                "sentence_index": s.sentence_index,
                "grammar_note": s.grammar_note,
                "speaker": s.speaker,
                "word_levels": s.word_levels,
            }
            for s in (subs or [])
        ],
        "practice": practice_by_level,
    }


async def begin_edit(db: AsyncSession, video: Video) -> Video:
    """Owner starts editing a published video: freeze the approved version to
    ``published_snapshot`` and flip to ``pending_review`` so the public keeps
    watching the snapshot while the owner edits the live draft."""
    if video.review_status != VideoReviewStatus.published.value:
        raise ValueError("只有已发布的视频才能开始编辑")
    video.published_snapshot = await _build_snapshot(db, video)
    video.review_status = VideoReviewStatus.pending_review.value
    video.submitted_at = None
    await commit_refresh(db, video)
    await invalidate_video_detail_cache(video.id)
    return video


async def submit_for_review(db: AsyncSession, video: Video) -> Video:
    """Owner submits a draft/rejected video for admin review."""
    if video.review_status not in (VideoReviewStatus.draft.value, VideoReviewStatus.rejected.value):
        raise ValueError("当前状态无法提交审核")
    if video.status != VideoStatus.ready:
        raise ValueError("视频仍在处理中，暂无法提交审核")
    # Must have at least one subtitle line to review.
    from app.models.subtitle import Subtitle

    has_subs = (
        await db.execute(
            select(func.count()).select_from(select(Subtitle).where(Subtitle.video_id == video.id).subquery())
        )
    ).scalar_one()
    if not has_subs:
        raise ValueError("尚无字幕，无法提交审核")

    video.review_status = VideoReviewStatus.pending_review.value
    video.submitted_at = datetime.now(UTC)
    video.rejection_reason = None
    await commit_refresh(db, video)
    await invalidate_video_detail_cache(video.id)
    return video


async def withdraw_submission(db: AsyncSession, video: Video) -> Video:
    """Owner withdraws a pending review back to draft."""
    if video.review_status != VideoReviewStatus.pending_review.value:
        raise ValueError("仅待审核状态可撤回")
    video.review_status = VideoReviewStatus.draft.value
    video.submitted_at = None
    await commit_refresh(db, video)
    await invalidate_video_detail_cache(video.id)
    return video


async def approve_review(db: AsyncSession, video: Video, admin: User) -> Video:
    """Admin approves a pending review: freeze live subtitles as the new public
    version and mark published. (Both is_published and review_status are kept in
    sync so existing listing filters keep working.)"""
    if video.review_status != VideoReviewStatus.pending_review.value:
        raise ValueError("仅待审核状态可批准")
    video.published_snapshot = await _build_snapshot(db, video)
    video.review_status = VideoReviewStatus.published.value
    video.is_published = True
    video.reviewed_by = admin.id
    video.reviewed_at = datetime.now(UTC)
    video.rejection_reason = None
    await commit_refresh(db, video)
    await invalidate_video_detail_cache(video.id)
    return video


async def reject_review(db: AsyncSession, video: Video, admin: User, reason: str) -> Video:
    """Admin rejects a pending review. The published_snapshot is preserved so
    the public keeps watching the last approved version (if any); the owner can
    edit the live draft and resubmit."""
    if video.review_status != VideoReviewStatus.pending_review.value:
        raise ValueError("仅待审核状态可驳回")
    video.review_status = VideoReviewStatus.rejected.value
    video.reviewed_by = admin.id
    video.reviewed_at = datetime.now(UTC)
    video.rejection_reason = reason
    await commit_refresh(db, video)
    await invalidate_video_detail_cache(video.id)
    return video

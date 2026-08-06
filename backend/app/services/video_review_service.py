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
from app.services.video_cache import invalidate_video_detail_cache
from app.services.video_publish import _publish_video

_SNAPSHOT_VERSION = 1


async def _build_snapshot(db: AsyncSession, video: Video) -> dict:
    """Freeze the current live subtitles into a snapshot dict.

    The snapshot is what the public keeps watching while the owner edits a
    pending/rejected draft. (Practice sets were removed from the snapshot when
    the 试题功能 went offline — 2026-08.)
    """
    result = await db.execute(select(Video).options(selectinload(Video.subtitles)).where(Video.id == video.id))
    loaded = result.scalar_one_or_none()
    subs = loaded.subtitles if loaded else []

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
    version and mark published."""
    if video.review_status != VideoReviewStatus.pending_review.value:
        raise ValueError("仅待审核状态可批准")
    video.published_snapshot = await _build_snapshot(db, video)
    await _publish_video(db, video, reviewed_by=admin.id)
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

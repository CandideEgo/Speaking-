"""Business logic for video operations.

Route handlers in api/v1/videos.py delegate to these functions
so HTTP concerns (parsing, status codes) stay separate from
domain logic (queries, state transitions, side effects).
"""

from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import commit_refresh
from app.models.learning import LearningRecord
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoSource, VideoStatus
from app.schemas.community import UserProfileBrief
from app.schemas.pagination import PaginatedResponse, paginated
from app.schemas.pagination import has_more as _has_more
from app.schemas.video import (
    RecomputeWordLevelsRequest,
    SubtitleBatchUpdate,
    SubtitleResponse,
    SubtitleUpdate,
    VideoAdminResponse,
    VideoAdminUpdate,
    VideoDetailResponse,
    VideoResponse,
    VideoStatusResponse,
    WordLevelsUpdate,
)
from app.services.video_access import (
    check_video_access,
    is_video_owner,
    should_use_snapshot,
)


async def list_public_videos(db: AsyncSession, page: int = 1, page_size: int = 20) -> dict:
    """List official public videos for the homepage. Paginated."""
    page = max(1, page)
    page_size = max(1, min(page_size, 50))
    offset = (page - 1) * page_size

    base = select(Video).where(
        Video.is_official == True,
        Video.is_published == True,
        Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    result = await db.execute(base.order_by(Video.created_at.desc()).offset(offset).limit(page_size + 1))
    rows = result.scalars().all()
    has_more = len(rows) > page_size
    items = [VideoResponse.model_validate(v) for v in rows[:page_size]]
    return paginated(items, page=page, page_size=page_size, has_more=has_more, total=total)


async def list_user_videos(db: AsyncSession, user_id: str, page: int = 1, page_size: int = 20) -> dict:
    """List videos belonging to a specific user. Paginated."""
    page = max(1, page)
    page_size = max(1, min(page_size, 50))
    offset = (page - 1) * page_size

    base = select(Video).where(Video.user_id == user_id)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    result = await db.execute(base.order_by(Video.created_at.desc()).offset(offset).limit(page_size + 1))
    rows = result.scalars().all()
    has_more = len(rows) > page_size
    items = [VideoResponse.model_validate(v) for v in rows[:page_size]]
    return paginated(items, page=page, page_size=page_size, has_more=has_more, total=total)


async def list_published_ugc_videos(db: AsyncSession, page: int = 1, page_size: int = 20) -> dict:
    """List published user-uploaded videos for the community feed.

    Per the UGC design, approved UGC surfaces only in the community feed (the
    homepage/browse feed stays official-curated). Returns ``{items, has_more}``.
    Each item includes a ``user`` brief (id, name, avatar_url) for attribution.
    """
    page = max(1, page)
    page_size = max(1, min(page_size, 50))
    offset = (page - 1) * page_size

    base = (
        select(Video)
        .where(
            Video.is_official == False,
            Video.review_status == VideoReviewStatus.published.value,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
        .options(selectinload(Video.user))
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    result = await db.execute(base.order_by(Video.created_at.desc()).offset(offset).limit(page_size + 1))
    rows = result.scalars().all()
    has_more = len(rows) > page_size
    items = []
    for v in rows[:page_size]:
        item = VideoResponse.model_validate(v).model_dump()
        item["user"] = UserProfileBrief.from_model(v.user) if v.user else None
        items.append(item)
    return {"items": items, "has_more": has_more, "total": total}


async def _invalidate_video_detail_cache(video_id: str) -> None:
    """Backward-compat wrapper — delegates to shared video_cache module.

    Retained for any external callers importing the private name; new code
    should import invalidate_video_detail_cache from app.services.video_cache.
    """
    from app.services.video_cache import invalidate_video_detail_cache

    await invalidate_video_detail_cache(video_id)


async def get_video_detail(
    db: AsyncSession,
    video_id: str,
    current_user: User | None,
) -> VideoDetailResponse:
    """Get video detail with subtitles. Creates a LearningRecord on first view."""

    # Check cache for official videos (user-owned videos are never cached)
    from app.core.cache import cache_get, cache_set

    cache_key = f"video:detail:{video_id}"
    if current_user is None or current_user.plan == "free":
        # Only cache for anonymous/free users on official videos
        cached = await cache_get(cache_key)
        if cached:
            return VideoDetailResponse.model_validate_json(cached)

    result = await db.execute(select(Video).options(selectinload(Video.subtitles)).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        return None

    # Access control: official videos are public; user-owned require auth
    if not check_video_access(video, current_user):
        return None

    # Create LearningRecord on first view for authenticated users (after access check)
    if current_user:
        lr_result = await db.execute(
            select(LearningRecord)
            .where(
                LearningRecord.user_id == current_user.id,
                LearningRecord.video_id == video_id,
            )
            .with_for_update()
        )
        if not lr_result.scalar_one_or_none():
            db.add(LearningRecord(user_id=current_user.id, video_id=video_id))
            try:
                await db.commit()
            except Exception as exc:
                await db.rollback()
                if "uq_learning_record_user_video" not in str(exc):
                    raise

    # Decide which subtitles the viewer sees. The owner always sees their live
    # (draft) subtitles. A non-owner viewing a UGC video under re-review
    # (pending/rejected) sees the frozen approved snapshot instead of the live
    # draft the owner is editing.
    use_snapshot = should_use_snapshot(video, current_user)

    if use_snapshot:
        from app.services.video_review_service import subtitles_from_snapshot

        subtitle_responses = subtitles_from_snapshot(video.published_snapshot)
    else:
        subtitle_responses = [
            SubtitleResponse(
                id=s.id,
                start_time=s.start_time,
                end_time=s.end_time,
                text_en=s.text_en,
                text_zh=s.text_zh,
                sentence_index=s.sentence_index,
                grammar_note=s.grammar_note,
                speaker=s.speaker,
                word_levels=s.word_levels,
            )
            for s in (video.subtitles or [])
        ]

    detail = VideoDetailResponse(
        id=video.id,
        title=video.title,
        source_url=video.source_url,
        video_source=video.video_source.value,
        thumbnail_url=video.thumbnail_url,
        duration=video.duration,
        difficulty_level=video.difficulty_level,
        status=video.status.value,
        topic_tags=video.topic_tags,
        is_official=video.is_official,
        is_published=video.is_published,
        review_status=video.review_status,
        # Only the owner sees the rejection reason; a public/snapshot viewer
        # never learns why an unpublished draft was rejected.
        # Cached responses (anonymous/free) must never include it.
        rejection_reason=video.rejection_reason if is_video_owner(video, current_user) else None,
        video_url_480p=video.video_url_480p,
        video_url_720p=video.video_url_720p,
        video_url_1080p=video.video_url_1080p,
        like_count=video.like_count,
        favorite_count=video.favorite_count,
        processing_mode=video.processing_mode,
        created_at=video.created_at.isoformat(),
        subtitles=subtitle_responses,
    )

    # Cache official video details for 5 minutes.
    # Only cache if rejection_reason is None (non-owner view) to prevent
    # leaking owner-only data to anonymous/free users via the shared cache.
    if video.is_official and detail.rejection_reason is None:
        await cache_set(cache_key, detail.model_dump_json(), ttl=300)

    return detail


async def get_video_status(
    db: AsyncSession,
    video_id: str,
    current_user: User | None,
) -> VideoStatusResponse | None:
    """Get processing status for a video. Returns None if not found / no access."""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        return None
    if not check_video_access(video, current_user):
        return None
    return VideoStatusResponse(
        status=video.status.value,
        video_url_720p=video.video_url_720p,
        processing_step=video.processing_step,
        processing_progress=video.processing_progress,
    )


# ---------------------------------------------------------------------------
# Admin video content management
# ---------------------------------------------------------------------------


async def list_all_videos(
    db: AsyncSession,
    *,
    status: str | None = None,
    is_official: bool | None = None,
    is_featured: bool | None = None,
    review_status: str | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedResponse[VideoAdminResponse]:
    """List every video (admin view) with filters.

    Unlike the public list, this returns videos in any status (including
    ``processing``/``error``). Keyword search uses ILIKE on title/topic_tags so
    it works on SQLite (tests) and Postgres alike — we deliberately avoid the
    Postgres-only ``search_vector`` column here. ``review_status`` filters the
    UGC review queue (e.g. ``pending_review``).
    """
    stmt = select(Video)
    if status:
        try:
            status_enum = VideoStatus(status)
        except ValueError:
            status_enum = None
        if status_enum is not None:
            stmt = stmt.where(Video.status == status_enum)
    if is_official is not None:
        stmt = stmt.where(Video.is_official == is_official)
    if is_featured is not None:
        stmt = stmt.where(Video.is_featured == is_featured)
    if review_status:
        stmt = stmt.where(Video.review_status == review_status)
    if keyword and keyword.strip():
        escaped_kw = keyword.strip().replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped_kw}%"
        stmt = stmt.where(or_(Video.title.ilike(pattern, escape="\\"), Video.topic_tags.ilike(pattern, escape="\\")))

    # total count for has_more
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(Video.created_at.desc()).limit(page_size + 1).offset((page - 1) * page_size)
    rows = (await db.execute(stmt)).scalars().all()

    has_more = total > page * page_size
    items = [VideoAdminResponse.model_validate(v) for v in rows[:page_size]]
    return PaginatedResponse(items=items, page=page, page_size=page_size, has_more=has_more)


async def get_ugc_pending_counts(db: AsyncSession) -> dict:
    """Count UGC (non-official) videos awaiting admin action.

    Returns ``{pending_processing, pending_review, total}`` for the admin
    top-bar badge. ``pending_processing`` = waiting for admin to start GPU
    processing; ``pending_review`` = processed, waiting for admin approval.
    Both counts are scoped to user-submitted (``is_official=False``) videos.
    """
    pending_processing = (
        await db.execute(
            select(func.count()).where(
                Video.is_official == False,
                Video.status == VideoStatus.pending_processing,
            )
        )
    ).scalar_one()
    pending_review = (
        await db.execute(
            select(func.count()).where(
                Video.is_official == False,
                Video.review_status == VideoReviewStatus.pending_review.value,
            )
        )
    ).scalar_one()
    return {
        "pending_processing": pending_processing,
        "pending_review": pending_review,
        "total": pending_processing + pending_review,
    }


async def _get_video_or_404(db: AsyncSession, video_id: str) -> Video:
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if video is None:
        raise ValueError("Video not found")
    return video


async def update_video(
    db: AsyncSession,
    video_id: str,
    payload: VideoAdminUpdate,
) -> VideoAdminResponse:
    """Apply a partial admin update to a video (None fields are skipped)."""
    video = await _get_video_or_404(db, video_id)

    # Publish guard: only ready videos may be published. Raising ValueError lets
    # the route handler map this to a 400 (mirrors localize's error mapping).
    if payload.is_published is True and video.status != VideoStatus.ready:
        raise ValueError("只能发布 status=ready 的视频")

    publish_changed = payload.is_published is not None and payload.is_published != video.is_published

    for field in (
        "title",
        "difficulty_level",
        "topic_tags",
        "is_official",
        "is_featured",
        "is_published",
        "show_on_homepage",
        "admin_notes",
    ):
        value = getattr(payload, field)
        if value is not None:
            setattr(video, field, value)

    # Keep review_status in sync with the admin publish toggle so the two
    # visibility gates never diverge (official videos are managed here; UGC
    # videos are managed via the dedicated approve/reject endpoints).
    if publish_changed:
        if video.is_published:
            video.review_status = VideoReviewStatus.published.value
        else:
            video.review_status = VideoReviewStatus.draft.value

    await commit_refresh(db, video)

    # Best-effort cache invalidation so the next read reflects new metadata.
    try:
        from app.core.redis import get_redis

        redis = await get_redis()
        await redis.delete(f"video:detail:{video_id}")
    except Exception:
        pass

    # Publish/unpublish changes which videos surface on the homepage/browse feed
    # — invalidate those caches too. (Subtitle edits don't need this; browse only
    # caches video metadata.)
    if publish_changed:
        from app.services.video_cache import invalidate_browse_cache

        await invalidate_browse_cache()

    return VideoAdminResponse.model_validate(video)


async def delete_video(db: AsyncSession, video_id: str) -> bool:
    """Delete a video and all of its dependents + on-disk media files.

    Most FKs to ``videos.id`` have no DB-level ``ondelete`` clause, so we
    delete the child rows explicitly. Comments/comment_stats rely on their
    existing ``cascade="all, delete-orphan"`` / ``ondelete=CASCADE`` and are
    cleaned up via the ORM relationship cascade when the video row goes.
    """
    video = await _get_video_or_404(db, video_id)

    # Explicit child-row cleanup for tables lacking ondelete CASCADE.
    # SpeakingAttempt -> subtitle (no ondelete), must go before subtitles.
    from app.models.community import Post  # local import to avoid cycle risk
    from app.models.learning import SpeakingAttempt, Vocabulary
    from app.models.subtitle import Subtitle

    # SpeakingAttempts reference subtitles by FK without ondelete, so remove
    # them before we delete the subtitle rows they point at.
    sub_ids_stmt = select(Subtitle.id).where(Subtitle.video_id == video_id)
    await db.execute(delete(SpeakingAttempt).where(SpeakingAttempt.subtitle_id.in_(sub_ids_stmt)))
    await db.execute(delete(Subtitle).where(Subtitle.video_id == video_id))
    await db.execute(delete(LearningRecord).where(LearningRecord.video_id == video_id))
    await db.execute(delete(Vocabulary).where(Vocabulary.video_id == video_id))
    await db.execute(delete(Post).where(Post.video_id == video_id))

    # Remove the video row (comments/comment_stats cascade via ORM).
    await db.delete(video)
    await db.commit()

    # Best-effort deletion of on-disk media files.
    _delete_media_files(video_id)

    # Best-effort cache invalidation.
    try:
        from app.core.redis import get_redis

        redis = await get_redis()
        await redis.delete(f"video:detail:{video_id}")
    except Exception:
        pass

    return True


def _delete_media_files(video_id: str) -> None:
    """Remove raw + transcoded media files for a video from local storage."""
    try:
        from app.core.config import get_settings

        media_dir = Path(get_settings().local_media_path).resolve()  # type: ignore[name-defined]
    except Exception:
        return
    if not media_dir.exists():
        return
    import glob

    for pattern in (f"{video_id}_raw.*", f"{video_id}_480p.mp4", f"{video_id}_720p.mp4", f"{video_id}_1080p.mp4"):
        for path in glob.glob(str(media_dir / pattern)):
            try:
                Path(path).unlink()
            except Exception:
                pass


# Single source of truth: import from pipeline_helpers instead of
# maintaining a separate constant that can drift out of sync.
from app.tasks.pipeline_helpers import STEP_PROGRESS as _STEP_PROGRESS

STEP_PROGRESS_DOWNLOADING = _STEP_PROGRESS["downloading"]


async def localize_video_admin(db: AsyncSession, video_id: str) -> VideoAdminResponse:
    """Kick off local download+transcode for an imported video (admin).

    Clears any existing local URLs and flips the video to ``processing`` so
    the admin panel can poll progress. Returns 409 (via ValueError) if the
    video is already being processed.
    """
    video = await _get_video_or_404(db, video_id)

    if video.status == VideoStatus.processing:
        raise ValueError("Video is already processing")

    video.video_url_480p = None
    video.video_url_720p = None
    video.video_url_1080p = None
    video.error_message = None
    video.processing_step = "downloading"
    video.processing_progress = STEP_PROGRESS_DOWNLOADING
    video.status = VideoStatus.processing
    await commit_refresh(db, video)

    from app.tasks.video_processing import localize_video

    localize_video.delay(video.id)
    return VideoAdminResponse.model_validate(video)

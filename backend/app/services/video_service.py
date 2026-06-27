"""Business logic for video operations.

Route handlers in api/v1/videos.py delegate to these functions
so HTTP concerns (parsing, status codes) stay separate from
domain logic (queries, state transitions, side effects).
"""

from pathlib import Path

from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import check_video_access
from app.models.learning import LearningRecord
from app.models.user import User
from app.models.video import Video, VideoSource, VideoStatus
from app.schemas.pagination import PaginatedResponse
from app.schemas.pagination import has_more as _has_more
from app.schemas.video import (
    SubtitleResponse,
    VideoAdminResponse,
    VideoAdminUpdate,
    VideoDetailResponse,
    VideoResponse,
    VideoStatusResponse,
)


def _detect_platform(source_url: str) -> VideoSource:
    """Determine video source from source URL.

    HTTP/HTTPS URLs are treated as imported (YouTube, etc.).
    Local file paths are treated as local.
    """
    if source_url.startswith(("http://", "https://")):
        return VideoSource.imported
    return VideoSource.local


async def submit_video(
    db: AsyncSession,
    source_url: str,
    current_user: User,
) -> VideoResponse:
    """Submit a new video URL for processing.

    If a ready video already exists for this URL, creates a new user
    reference instead of re-processing.
    """
    platform = _detect_platform(source_url)

    # Check if this URL was already processed
    result = await db.execute(
        select(Video).where(
            Video.source_url == source_url,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Create a new reference for this user
        user_video = Video(
            user_id=current_user.id,
            title=existing.title,
            source_url=source_url,
            video_source=existing.video_source,
            thumbnail_url=existing.thumbnail_url,
            duration=existing.duration,
            difficulty_level=existing.difficulty_level,
            video_url_480p=existing.video_url_480p,
            video_url_720p=existing.video_url_720p,
            video_url_1080p=existing.video_url_1080p,
            processing_mode=existing.processing_mode,
            status=existing.status,
        )
        db.add(user_video)
        await db.commit()
        await db.refresh(user_video)
        return VideoResponse.model_validate(user_video)

    # New video -- queue for processing
    video = Video(
        user_id=current_user.id,
        title="Processing...",
        source_url=source_url,
        video_source=platform,
        status=VideoStatus.processing,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    # Dispatch to Celery — all platforms use full processing (download + transcode)
    from app.tasks.video_processing import process_video

    process_video.delay(video.id)

    return VideoResponse.model_validate(video)


async def seed_video(
    db: AsyncSession,
    source_url: str,
) -> VideoResponse:
    """Seed an official video for the public homepage. Admin only."""
    platform = _detect_platform(source_url)

    video = Video(
        title="Processing...",
        source_url=source_url,
        video_source=platform,
        status=VideoStatus.processing,
        is_official=True,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    from app.tasks.video_processing import process_video

    process_video.delay(video.id)

    return VideoResponse.model_validate(video)


async def list_public_videos(db: AsyncSession) -> list[VideoResponse]:
    """List official public videos for the homepage."""
    result = await db.execute(
        select(Video)
        .where(Video.is_official == True, Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]))
        .order_by(Video.created_at.desc())
        .limit(50)
    )
    videos = result.scalars().all()
    return [VideoResponse.model_validate(v) for v in videos]


async def list_user_videos(db: AsyncSession, user_id: str) -> list[VideoResponse]:
    """List videos belonging to a specific user."""
    result = await db.execute(select(Video).where(Video.user_id == user_id).order_by(Video.created_at.desc()).limit(50))
    videos = result.scalars().all()
    return [VideoResponse.model_validate(v) for v in videos]


async def get_video_detail(
    db: AsyncSession,
    video_id: str,
    current_user: User | None,
) -> VideoDetailResponse:
    """Get video detail with subtitles. Creates a LearningRecord on first view."""
    # Create LearningRecord on first view for authenticated users
    # (done before cache check so it always fires)
    if current_user:
        lr_result = await db.execute(
            select(LearningRecord).where(
                LearningRecord.user_id == current_user.id,
                LearningRecord.video_id == video_id,
            )
        )
        if not lr_result.scalar_one_or_none():
            db.add(LearningRecord(user_id=current_user.id, video_id=video_id))
            await db.commit()

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
        video_url_480p=video.video_url_480p,
        video_url_720p=video.video_url_720p,
        video_url_1080p=video.video_url_1080p,
        processing_mode=video.processing_mode,
        created_at=video.created_at.isoformat(),
        subtitles=[
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
        ],
    )

    # Cache official video details for 5 minutes
    if video.is_official:
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


async def get_video_quiz(
    db: AsyncSession,
    video_id: str,
    current_user: User | None,
) -> dict | None:
    """Get quiz questions for a video. Returns None if not found / no access."""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        return None
    if not check_video_access(video, current_user):
        return None
    return {
        "video_id": video.id,
        "quiz": video.quiz_data or [],
    }


async def submit_quiz_result(
    db: AsyncSession,
    video_id: str,
    user_id: str,
    score: float,
) -> dict:
    """Submit quiz score and update learning record."""
    # Verify video exists
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        return None

    # Upsert LearningRecord with quiz score
    lr_result = await db.execute(
        select(LearningRecord).where(
            LearningRecord.user_id == user_id,
            LearningRecord.video_id == video_id,
        )
    )
    record = lr_result.scalar_one_or_none()
    if record:
        record.quiz_score = score
        if score >= 60:
            record.completed = True
    else:
        record = LearningRecord(
            user_id=user_id,
            video_id=video_id,
            quiz_score=score,
            completed=score >= 60,
        )
        db.add(record)

    await db.commit()
    return {"success": True, "quiz_score": score}


async def search_videos(
    db: AsyncSession,
    query: str,
    limit: int = 20,
    user_id: str | None = None,
) -> list[VideoResponse]:
    """Search videos using PostgreSQL full-text search with ILIKE fallback.

    Uses ``plainto_tsquery`` for safe user input handling and ``ts_rank``
    for relevance scoring.  An ILIKE fallback ensures partial matches
    and non-English queries still work.

    Access control: official videos are always visible; user-submitted
    videos are only visible to their owner.
    Only videos with status 'ready' or 'ready_subtitles' are searchable.
    """
    if not query or not query.strip():
        return []

    limit = max(1, min(limit, 50))
    pattern = f"%{query.strip()}%"

    # Full-text search query (handles special chars safely)
    ts_query = func.plainto_tsquery("english", query.strip())

    # Relevance: ts_rank for FTS + small ILIKE bonus for partial matches
    relevance = func.ts_rank(Video.search_vector, ts_query) + case(
        (Video.title.ilike(pattern), 0.5),
        else_=0,
    )

    # Base filters: status ready + access control
    status_filter = Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles])
    access_filter = or_(
        Video.is_official == True,
        Video.user_id == user_id,
    )

    # Match via tsvector OR ILIKE fallback (for partial/non-English queries)
    match_filter = or_(
        Video.search_vector.op("@@")(ts_query),
        Video.title.ilike(pattern),
        Video.topic_tags.ilike(pattern),
    )

    stmt = (
        select(Video)
        .where(status_filter, access_filter, match_filter)
        .order_by(relevance.desc(), Video.created_at.desc())
        .limit(limit)
    )

    result = await db.execute(stmt)
    videos = result.scalars().all()
    return [VideoResponse.model_validate(v) for v in videos]


async def search_subtitles(
    db: AsyncSession,
    query: str,
    limit: int = 10,
    user_id: str | None = None,
) -> list[dict]:
    """Search subtitle text, return video + matching subtitle snippets.

    Groups results by video, showing up to 3 matching subtitle snippets
    per video.  Uses FTS on subtitle text_en with ILIKE fallback.
    """
    if not query or not query.strip():
        return []

    from app.models.subtitle import Subtitle

    limit = max(1, min(limit, 30))
    pattern = f"%{query.strip()}%"
    ts_query = func.plainto_tsquery("english", query.strip())

    # Find subtitles matching the query, join to video for access control
    stmt = (
        select(Subtitle, Video)
        .join(Video, Subtitle.video_id == Video.id)
        .where(
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
            or_(Video.is_official == True, Video.user_id == user_id),
            or_(
                Subtitle.text_en.ilike(pattern),
                Subtitle.text_en.op("@@")(ts_query),
            ),
        )
        .order_by(Video.created_at.desc())
        .limit(limit * 5)  # over-fetch to deduplicate videos
    )

    result = await db.execute(stmt)
    rows = result.all()

    # Group by video, take up to 3 matching snippets per video
    seen_videos: dict[str, dict] = {}
    for sub, vid in rows:
        if vid.id not in seen_videos:
            seen_videos[vid.id] = {
                "video": VideoResponse.model_validate(vid).model_dump(),
                "matching_subtitles": [],
            }
        entry = seen_videos[vid.id]
        if len(entry["matching_subtitles"]) < 3:
            entry["matching_subtitles"].append(
                {
                    "id": sub.id,
                    "text_en": sub.text_en,
                    "start_time": sub.start_time,
                    "end_time": sub.end_time,
                }
            )

    return list(seen_videos.values())[:limit]


# ---------------------------------------------------------------------------
# Admin video content management
# ---------------------------------------------------------------------------


async def list_all_videos(
    db: AsyncSession,
    *,
    status: str | None = None,
    is_official: bool | None = None,
    is_featured: bool | None = None,
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedResponse[VideoAdminResponse]:
    """List every video (admin view) with filters.

    Unlike the public list, this returns videos in any status (including
    ``processing``/``error``). Keyword search uses ILIKE on title/topic_tags so
    it works on SQLite (tests) and Postgres alike — we deliberately avoid the
    Postgres-only ``search_vector`` column here.
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
    if keyword and keyword.strip():
        pattern = f"%{keyword.strip()}%"
        stmt = stmt.where(or_(Video.title.ilike(pattern), Video.topic_tags.ilike(pattern)))

    # total count for has_more
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(Video.created_at.desc()).limit(page_size + 1).offset((page - 1) * page_size)
    rows = (await db.execute(stmt)).scalars().all()

    has_more = total > page * page_size
    items = [VideoAdminResponse.model_validate(v) for v in rows[:page_size]]
    return PaginatedResponse(items=items, page=page, page_size=page_size, has_more=has_more)


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

    for field in ("title", "difficulty_level", "topic_tags", "is_official", "is_featured", "admin_notes"):
        value = getattr(payload, field)
        if value is not None:
            setattr(video, field, value)

    await db.commit()
    await db.refresh(video)

    # Best-effort cache invalidation so the next read reflects new metadata.
    try:
        from app.core.redis import get_redis

        redis = await get_redis()
        await redis.delete(f"video:detail:{video_id}")
    except Exception:
        pass

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


# Mirrors STEP_PROGRESS["downloading"] from app.tasks.video_processing to avoid
# importing the task module at service load time.
STEP_PROGRESS_DOWNLOADING = 10


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
    await db.commit()
    await db.refresh(video)

    from app.tasks.video_processing import localize_video

    localize_video.delay(video.id)
    return VideoAdminResponse.model_validate(video)

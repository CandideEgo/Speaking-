"""Business logic for video operations.

Route handlers in api/v1/videos.py delegate to these functions
so HTTP concerns (parsing, status codes) stay separate from
domain logic (queries, state transitions, side effects).
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, case
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.video import Video, VideoStatus, Platform
from app.models.learning import LearningRecord
from app.api.dependencies import check_video_access
from app.schemas.video import (
    VideoResponse,
    VideoDetailResponse,
    SubtitleResponse,
    VideoStatusResponse,
)
from app.utils.platform_utils import detect_platform, extract_youtube_video_id


async def submit_video(
    db: AsyncSession,
    source_url: str,
    current_user: User,
) -> VideoResponse:
    """Submit a new video URL for processing.

    If a ready video already exists for this URL, creates a new user
    reference instead of re-processing.
    """
    platform = detect_platform(source_url)

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
            platform=existing.platform,
            thumbnail_url=existing.thumbnail_url,
            duration=existing.duration,
            difficulty_level=existing.difficulty_level,
            video_url_480p=existing.video_url_480p,
            video_url_720p=existing.video_url_720p,
            video_url_1080p=existing.video_url_1080p,
            youtube_video_id=existing.youtube_video_id,
            processing_mode=existing.processing_mode,
            status=existing.status,
        )
        db.add(user_video)
        await db.commit()
        await db.refresh(user_video)
        return VideoResponse.model_validate(user_video)

    # New video -- queue for processing
    youtube_video_id = extract_youtube_video_id(source_url) if platform == Platform.youtube else None
    video = Video(
        user_id=current_user.id,
        title="Processing...",
        source_url=source_url,
        platform=platform,
        youtube_video_id=youtube_video_id,
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
    platform = detect_platform(source_url)
    youtube_video_id = extract_youtube_video_id(source_url) if platform == Platform.youtube else None

    video = Video(
        title="Processing...",
        source_url=source_url,
        platform=platform,
        youtube_video_id=youtube_video_id,
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
    result = await db.execute(
        select(Video)
        .where(Video.user_id == user_id)
        .order_by(Video.created_at.desc())
        .limit(50)
    )
    videos = result.scalars().all()
    return [VideoResponse.model_validate(v) for v in videos]


async def get_video_detail(
    db: AsyncSession,
    video_id: str,
    current_user: User | None,
) -> VideoDetailResponse:
    """Get video detail with subtitles. Creates a LearningRecord on first view."""
    result = await db.execute(
        select(Video)
        .options(selectinload(Video.subtitles))
        .where(Video.id == video_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        return None

    # Access control: official videos are public; user-owned require auth
    if not check_video_access(video, current_user):
        return None

    # Create LearningRecord on first view for authenticated users
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

    return VideoDetailResponse(
        id=video.id,
        title=video.title,
        source_url=video.source_url,
        platform=video.platform.value,
        thumbnail_url=video.thumbnail_url,
        duration=video.duration,
        difficulty_level=video.difficulty_level,
        status=video.status.value,
        topic_tags=video.topic_tags,
        is_official=video.is_official,
        video_url_480p=video.video_url_480p,
        video_url_720p=video.video_url_720p,
        video_url_1080p=video.video_url_1080p,
        youtube_video_id=video.youtube_video_id,
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
            )
            for s in (video.subtitles or [])
        ],
    )


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
    return VideoStatusResponse(status=video.status.value, video_url_720p=video.video_url_720p, processing_step=video.processing_step)


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
    """Search videos by title and topic tags.

    Access control: official videos are always visible; user-submitted
    videos are only visible to their owner.
    Only videos with status 'ready' or 'ready_subtitles' are searchable.

    Results are ordered by relevance: exact title match first, then
    partial title match, then topic-tag match.
    """
    if not query or not query.strip():
        return []

    limit = max(1, min(limit, 50))
    pattern = f"%{query.strip()}%"
    exact_pattern = query.strip()

    # Build relevance score: exact title > partial title > topic tag match
    relevance = case(
        (Video.title == exact_pattern, 3),
        (Video.title.ilike(exact_pattern), 2),
        (Video.title.ilike(pattern), 1),
        else_=0,
    ) + case(
        (Video.topic_tags.ilike(pattern), 1),
        else_=0,
    )

    # Base filters: status ready + access control
    status_filter = Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles])
    access_filter = or_(
        Video.is_official == True,
        Video.user_id == user_id,
    )

    # Must match at least title or topic_tags
    match_filter = or_(
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

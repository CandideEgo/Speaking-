"""Video submission and seeding — create Video rows and dispatch Celery tasks.

Handles user submission, admin seed, and user-seed flows. All share the
pattern: detect platform, check for duplicates (or not), create Video,
commit, dispatch process_video.delay().
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoSource, VideoStatus
from app.schemas.video import VideoResponse


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
        await commit_refresh(db, user_video)
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
    await commit_refresh(db, video)

    # Dispatch to Celery — all platforms use full processing (download + transcode)
    from app.tasks.video_processing import process_video

    process_video.delay(video.id)

    return VideoResponse.model_validate(video)


async def seed_video(
    db: AsyncSession,
    source_url: str,
    auto_publish: bool = False,
) -> VideoResponse:
    """Seed an official video for the public homepage. Admin only.

    If an official video for this URL is already ready (or has subtitles), it
    is returned as-is instead of re-running the whole pipeline — prevents
    duplicate rows when an admin re-clicks the seed button.
    """
    # Dedup: an official, already-processed video for this URL wins.
    existing_result = await db.execute(
        select(Video).where(
            Video.source_url == source_url,
            Video.is_official == True,
            Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        return VideoResponse.model_validate(existing)

    platform = _detect_platform(source_url)

    video = Video(
        title="Processing...",
        source_url=source_url,
        video_source=platform,
        status=VideoStatus.processing,
        is_official=True,
        # Seeded as a draft: stays off the homepage until published. The
        # one-click flow sets auto_publish=True so finalize_video publishes it
        # automatically once ready; the manual flow leaves it False for review.
        is_published=False,
        auto_publish=auto_publish,
    )
    db.add(video)
    await commit_refresh(db, video)

    from app.tasks.video_processing import process_video

    process_video.delay(video.id)

    return VideoResponse.model_validate(video)


async def seed_user_video(
    db: AsyncSession,
    source_url: str,
    current_user: User,
    *,
    auto_publish: bool = False,
) -> VideoResponse:
    """Seed a video from a URL on behalf of a regular (non-admin) user.

    Similar to seed_video but creates a UGC video (is_official=False)
    owned by the submitting user, starting in draft review status.
    When ``auto_publish=True`` (the one-click flow), the video is
    auto-published once the pipeline completes, but still needs admin
    review before appearing in the community feed.
    """
    platform = _detect_platform(source_url)

    video = Video(
        title="Processing...",
        source_url=source_url,
        video_source=platform,
        status=VideoStatus.processing,
        user_id=current_user.id,
        is_official=False,
        is_published=False,
        review_status=VideoReviewStatus.draft.value,
        auto_publish=auto_publish,
    )
    db.add(video)
    await commit_refresh(db, video)

    from app.tasks.video_processing import process_video

    process_video.delay(video.id)

    return VideoResponse.model_validate(video)

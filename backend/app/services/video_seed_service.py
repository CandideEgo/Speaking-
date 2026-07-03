"""Video submission and seeding — create Video rows and dispatch Celery tasks.

Handles user submission, admin seed, and user-seed flows.

- Admin seed (seed_video): creates video in "processing" status and immediately
  dispatches process_video.delay() — admin-seeded videos auto-process.
- User submission (submit_video, seed_user_video, upload): creates video in
  "pending_processing" status — waits for admin to trigger processing via
  the start_processing() function. Stays in draft after processing completes
  so the creator can edit subtitles/practice before submitting for review.
- start_processing(): admin triggers GPU processing for a pending video.
  Checks that the local GPU worker is online (via Redis heartbeat) before
  dispatching the Celery task.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.core.redis import get_redis
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

    # New video — wait for admin to trigger processing.  Stays in draft
    # after processing so the creator can edit before submitting for review.
    video = Video(
        user_id=current_user.id,
        title="Processing...",
        source_url=source_url,
        video_source=platform,
        status=VideoStatus.pending_processing,
        auto_publish=False,
    )
    db.add(video)
    await commit_refresh(db, video)

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
        processing_started_at=datetime.now(UTC),
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
    UGC videos always require admin review before appearing in the
    community feed, regardless of the ``auto_publish`` flag.
    """
    platform = _detect_platform(source_url)

    video = Video(
        title="Processing...",
        source_url=source_url,
        video_source=platform,
        status=VideoStatus.pending_processing,
        user_id=current_user.id,
        is_official=False,
        is_published=False,
        review_status=VideoReviewStatus.draft.value,
        auto_publish=auto_publish,
    )
    db.add(video)
    await commit_refresh(db, video)

    return VideoResponse.model_validate(video)


# ---------------------------------------------------------------------------
# Admin-triggered processing
# ---------------------------------------------------------------------------

_WORKER_HEARTBEAT_KEY = "worker:gpu:heartbeat"


async def is_gpu_worker_online() -> bool:
    """Check if the local GPU worker is online (heartbeat present in Redis)."""
    try:
        r = get_redis()
        return bool(await r.exists(_WORKER_HEARTBEAT_KEY))
    except Exception:
        return False


async def start_processing(db: AsyncSession, video_id: str) -> VideoResponse:
    """Admin triggers GPU processing for a pending_processing video.

    Only allowed when:
    - The video exists and is in ``pending_processing`` status.
    - The local GPU worker is confirmed online (Redis heartbeat key present).

    Raises:
        ValueError: If the video is not found, not in pending_processing status,
                    or the GPU worker is offline.
    """
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if video is None:
        raise ValueError("Video not found")
    if video.status != VideoStatus.pending_processing:
        raise ValueError(f"Video is not in pending_processing state (current: {video.status.value})")

    # Check GPU worker heartbeat
    worker_online = await is_gpu_worker_online()
    if not worker_online:
        raise ValueError("GPU worker is offline — please start the local processing service first")

    # Transition to processing and dispatch Celery task
    video.status = VideoStatus.processing
    video.processing_started_at = datetime.now(UTC)
    await commit_refresh(db, video)

    from app.tasks.video_processing import process_video

    process_video.delay(video.id)

    return VideoResponse.model_validate(video)


async def recover_processing(db: AsyncSession, video_id: str) -> VideoResponse:
    """Re-dispatch ``finalize_video`` for a video stuck mid-pipeline.

    When the cloud Celery worker dies during ``finalize_video`` (the most
    common cause of a stuck video), the ``video:processing:{id}`` Redis lock
    is left behind and ``finalize_video`` refuses to re-run ("already being
    processed, skipping"). This clears that stale lock and re-dispatches
    ``finalize_video``, which is resume-safe — each step checks
    ``_is_step_done()`` and skips completed work (translating / annotating /
    prewarm_notes / downloading).

    Only allowed for the stuck statuses (``processing`` / ``ready_subtitles``).
    A video still pending GPU trigger should use ``start_processing``; a
    ``ready`` / ``error`` video needs no recovery. No worker-online gate:
    finalize runs on the ``celery`` queue (cloud worker), not the GPU worker,
    so the task simply queues until a cloud worker is up — standard Celery.

    Raises:
        ValueError: If the video is not found, or not in a recoverable status.
    """
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if video is None:
        raise ValueError("Video not found")
    if video.status not in (VideoStatus.processing, VideoStatus.ready_subtitles):
        raise ValueError(
            f"Video is not in a recoverable state (current: {video.status.value}). "
            f"Use start-processing for pending_processing; ready/error need no recovery."
        )

    # Clear the stale processing lock so finalize_video won't skip.
    try:
        r = get_redis()
        await r.delete(f"video:processing:{video.id}")
    except Exception:
        # Fail-open Redis: if Redis is down, finalize_video's lock check also
        # fails open, so recovery still proceeds.
        pass

    from app.tasks.video_processing import finalize_video

    finalize_video.delay(str(video.id))

    return VideoResponse.model_validate(video)

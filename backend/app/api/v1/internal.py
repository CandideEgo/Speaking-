"""Internal API endpoints — not for public/frontend consumption.

Currently hosts the transcription callback: the remote GPU worker POSTs its
Whisper transcription results here so the cloud can persist subtitles and kick
off the pipeline tail. Authenticated by a shared secret (no JWT).
"""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.core.logging import get_logger
from app.models.subtitle import Subtitle
from app.models.video import Video, VideoStatus
from app.schemas.video import TranscriptionCallbackRequest

router = APIRouter(prefix="/internal", tags=["internal"])

logger = get_logger(__name__)

# Redis-based dedup lock for the callback endpoint.  Two concurrent callbacks
# (e.g. a Celery retry that fires a second POST before the first commits) can
# both read ``status == processing`` and proceed, causing double subtitle
# insert + double ``finalize_video.delay()``.  The lock serialises them.
_CALLBACK_LOCK_TTL = 5 * 60  # 5 minutes — more than enough for the DB work


def _acquire_callback_lock(video_id: str) -> bool:
    """Try to acquire a Redis SETNX lock for the callback.  Returns True if
    acquired, False if another callback is already in-flight."""
    try:
        import redis as redis_lib

        settings = get_settings()
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)
        lock_key = f"video:callback:{video_id}"
        return bool(r.set(lock_key, "1", nx=True, ex=_CALLBACK_LOCK_TTL))
    except Exception:
        # If Redis is down, allow the callback through — the status check
        # below still provides a basic idempotency guard.
        return True


def _release_callback_lock(video_id: str) -> None:
    """Release the callback lock after successful processing."""
    try:
        import redis as redis_lib

        settings = get_settings()
        r = redis_lib.from_url(settings.redis_url, decode_responses=True)
        r.delete(f"video:callback:{video_id}")
    except Exception:
        pass


@router.post("/transcription/callback")
@rate_limit("30/minute")
async def transcription_callback(
    request: Request,
    payload: TranscriptionCallbackRequest,
    x_callback_secret: str = Header(default="", alias="X-Callback-Secret"),
    db: AsyncSession = Depends(get_db),
):
    """Receive transcription results from the remote GPU worker.

    Idempotency: the callback is only honored while the video is still in the
    ``processing`` state (i.e. waiting for transcription). Any later/duplicate
    callback (e.g. a Celery redelivery after the tail has already run) is
    acknowledged but ignored — this prevents both double-enqueuing the tail and
    wiping already-translated subtitles.
    """
    settings = get_settings()
    expected = settings.transcription_callback_secret
    if not expected or not secrets.compare_digest(x_callback_secret, expected):
        raise HTTPException(status_code=401, detail="Invalid callback secret")

    result = await db.execute(select(Video).where(Video.id == payload.video_id))
    video = result.scalar_one_or_none()
    if not video:
        # Acknowledge so the GPU worker stops retrying a callback for a deleted video.
        return {"acknowledged": True}

    # Only act while transcription is still pending. Once the tail has started
    # (status != processing) the video is past this stage — ignore duplicates.
    if video.status != VideoStatus.processing:
        return {"acknowledged": True}

    # Acquire a Redis dedup lock to prevent two concurrent callbacks from both
    # passing the status check and proceeding to double-insert subtitles.
    if not _acquire_callback_lock(payload.video_id):
        return {"acknowledged": True}

    try:
        if payload.status == "error":
            video.status = VideoStatus.error
            video.error_message = payload.error or "Transcription failed"
            video.processing_step = None
            await db.commit()
            return {"acknowledged": True}

        # status == "ok": insert subtitles and hand off to the tail.
        # Guard against re-inserting: if subtitles already exist (a duplicate
        # callback raced past the status guard, or a prior partial insert left
        # rows behind), keep the existing set rather than wiping them —
        # deleting would discard any already-translated rows.
        segments = payload.segments or []
        existing = await db.scalar(
            select(func.count()).select_from(Subtitle).where(Subtitle.video_id == payload.video_id)
        )
        if existing:
            logger.info("Subtitles already exist for video %s, skipping insert", payload.video_id)
        else:
            for i, seg in enumerate(segments):
                db.add(
                    Subtitle(
                        video_id=video.id,
                        start_time=seg.start,
                        end_time=seg.end,
                        text_en=seg.text,
                        sentence_index=i,
                    )
                )
        video.status = VideoStatus.ready_subtitles
        video.processing_step = "translating"
        video.processing_progress = 70
        await db.commit()

        # Enqueue the tail (translate → download → transcode). Imported here to
        # avoid a circular import at module load.
        from app.tasks.video_processing import finalize_video

        finalize_video.delay(payload.video_id)
    finally:
        # Release lock so a future retry (if needed) can proceed.
        _release_callback_lock(payload.video_id)

    return {"acknowledged": True}

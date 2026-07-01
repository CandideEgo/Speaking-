"""Internal API endpoints — not for public/frontend consumption.

Currently hosts the transcription callback: the remote GPU worker POSTs its
Whisper transcription results here so the cloud can persist subtitles and kick
off the pipeline tail. Authenticated by a shared secret (no JWT).
"""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.subtitle import Subtitle
from app.models.video import Video, VideoStatus
from app.schemas.video import TranscriptionCallbackRequest

router = APIRouter(prefix="/internal", tags=["internal"])


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

    if payload.status == "error":
        video.status = VideoStatus.error
        video.error_message = payload.error or "Transcription failed"
        video.processing_step = None
        await db.commit()
        return {"acknowledged": True}

    # status == "ok": replace subtitles and hand off to the tail.
    segments = payload.segments or []
    await db.execute(delete(Subtitle).where(Subtitle.video_id == payload.video_id))
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
    return {"acknowledged": True}

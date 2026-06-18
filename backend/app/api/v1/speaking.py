"""Speaking route handlers — thin HTTP layer only.

All business logic lives in app.services.speaking_service.
These handlers validate HTTP-level concerns (content-type, size),
call the service, and return responses.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.models.user import User
from app.models.learning import SpeakingAttempt
from app.schemas.speaking import SpeakingAttemptResponse, SpeakingSubmitResponse
from app.services.speaking_service import (
    check_daily_limit,
    get_subtitle_text,
    evaluate_speaking,
    update_learning_record,
    get_user_stats,
)
from app.api.dependencies import get_current_user
from app.core.limiter import limiter, rate_limit

router = APIRouter(prefix="/speaking", tags=["speaking"])


MAX_AUDIO_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_AUDIO_TYPES = {"audio/webm", "audio/wav", "audio/mp3", "audio/mpeg", "audio/ogg"}
ALLOWED_EXTENSIONS = {".webm", ".wav", ".mp3", ".ogg"}


@router.post("/practice", response_model=SpeakingSubmitResponse)
@rate_limit("10/minute")
async def submit_speaking(
    request: Request,
    audio: UploadFile = File(...),
    subtitle_id: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # --- HTTP-level validation ---
    if audio.content_type and audio.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format: {audio.content_type}. Use WebM, WAV, MP3, or OGG.",
        )

    if audio.filename:
        ext = audio.filename[audio.filename.rfind("."):].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file extension: {ext}. Use .webm, .wav, .mp3, or .ogg.",
            )

    audio_data = await audio.read()
    if len(audio_data) > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio file too large: {len(audio_data)} bytes. Maximum is {MAX_AUDIO_SIZE} bytes (5 MB).",
        )

    # --- Business logic ---
    # Validate subtitle exists
    text_en, video_id = await get_subtitle_text(db, subtitle_id)
    if text_en is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtitle not found")

    # Check free-tier daily limit
    try:
        await check_daily_limit(db, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    # Evaluate speaking attempt
    attempt = await evaluate_speaking(
        db, current_user.id, subtitle_id, audio_data, text_en
    )

    # Update learning record
    await update_learning_record(db, current_user.id, video_id)

    return SpeakingSubmitResponse(
        id=attempt.id,
        accuracy=attempt.accuracy or 0,
        fluency=attempt.fluency or 0,
        completeness=attempt.completeness or 0,
        feedback=attempt.feedback or "",
        transcript=attempt.transcript or "",
    )


@router.get("/attempts")
@rate_limit("30/minute")
async def list_attempts(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List speaking attempts (paginated)."""
    offset = (page - 1) * page_size
    result = await db.execute(
        select(SpeakingAttempt)
        .where(SpeakingAttempt.user_id == current_user.id)
        .order_by(SpeakingAttempt.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    attempts = result.scalars().all()

    # Count total for has_more
    count_result = await db.execute(
        select(func.count(SpeakingAttempt.id))
        .where(SpeakingAttempt.user_id == current_user.id)
    )
    total = count_result.scalar_one()

    return {
        "items": [SpeakingAttemptResponse.model_validate(a) for a in attempts],
        "page": page,
        "page_size": page_size,
        "has_more": total > page * page_size,
    }


@router.get("/stats")
@rate_limit("30/minute")
async def speaking_stats(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_user_stats(db, current_user.id)

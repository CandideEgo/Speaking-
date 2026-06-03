from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.user import User
from app.models.subtitle import Subtitle
from app.models.learning import SpeakingAttempt, LearningRecord
from app.schemas.speaking import SpeakingAttemptResponse, SpeakingSubmitResponse
from app.services.speaking_service import evaluate_speaking, get_user_stats
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
    # Validate audio content type
    if audio.content_type and audio.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format: {audio.content_type}. Use WebM, WAV, MP3, or OGG.",
        )

    # Validate file extension
    if audio.filename:
        ext = audio.filename[audio.filename.rfind("."):].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file extension: {ext}. Use .webm, .wav, .mp3, or .ogg.",
            )

    # Read and validate size
    audio_data = await audio.read()
    if len(audio_data) > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio file too large: {len(audio_data)} bytes. Maximum is {MAX_AUDIO_SIZE} bytes (5 MB).",
        )

    # Validate subtitle exists
    result = await db.execute(select(Subtitle).where(Subtitle.id == subtitle_id))
    subtitle = result.scalar_one_or_none()
    if not subtitle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtitle not found")

    # Limit free users to 3 attempts per day
    if current_user.plan.value == "free":
        from datetime import datetime, timezone, timedelta
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        count_result = await db.execute(
            select(SpeakingAttempt).where(
                SpeakingAttempt.user_id == current_user.id,
                SpeakingAttempt.created_at >= today,
            )
        )
        today_attempts = len(count_result.scalars().all())
        if today_attempts >= 3:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Free tier: max 3 speaking practices per day. Upgrade to Pro for unlimited.",
            )

    attempt = await evaluate_speaking(
        db, current_user.id, subtitle_id, audio_data, subtitle.text_en
    )

    # Update LearningRecord: increment speaking_attempts
    lr_result = await db.execute(
        select(LearningRecord).where(
            LearningRecord.user_id == current_user.id,
            LearningRecord.video_id == subtitle.video_id,
        )
    )
    record = lr_result.scalar_one_or_none()
    if record:
        record.speaking_attempts += 1
    else:
        db.add(LearningRecord(
            user_id=current_user.id,
            video_id=subtitle.video_id,
            speaking_attempts=1,
        ))
    await db.commit()

    return SpeakingSubmitResponse(
        id=attempt.id,
        accuracy=attempt.accuracy or 0,
        fluency=attempt.fluency or 0,
        completeness=attempt.completeness or 0,
        feedback=attempt.feedback or "",
        transcript=attempt.transcript or "",
    )


@router.get("/attempts", response_model=list[SpeakingAttemptResponse])
async def list_attempts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SpeakingAttempt)
        .where(SpeakingAttempt.user_id == current_user.id)
        .order_by(SpeakingAttempt.created_at.desc())
        .limit(50)
    )
    attempts = result.scalars().all()
    return [SpeakingAttemptResponse.model_validate(a) for a in attempts]


@router.get("/stats")
async def speaking_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_user_stats(db, current_user.id)

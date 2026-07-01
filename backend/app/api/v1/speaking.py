from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.learning import LearningRecord, SpeakingAttempt
from app.models.subtitle import Subtitle
from app.models.user import User
from app.schemas.speaking import (
    CriterionScore,
    FreePracticeResponse,
    SpeakingAttemptResponse,
    SpeakingSubmitResponse,
)
from app.services.ai_service import AIServiceError
from app.services.speaking_service import (
    check_daily_limit,
    evaluate_free_speaking,
    evaluate_speaking,
    get_subtitle_text,
    get_user_stats,
    update_learning_record,
)

router = APIRouter(prefix="/speaking", tags=["speaking"])


MAX_AUDIO_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_AUDIO_TYPES = {"audio/webm", "audio/wav", "audio/mp3", "audio/mpeg", "audio/ogg"}
ALLOWED_EXTENSIONS = {".webm", ".wav", ".mp3", ".ogg"}
# shadowing was removed (dead mode); only read_aloud (subtitle practice) and
# free_speaking (free-practice endpoint) remain.
VALID_MODES = {"read_aloud", "free_speaking"}


@router.post("/practice", response_model=SpeakingSubmitResponse)
@rate_limit("10/minute")
async def submit_speaking(
    request: Request,
    audio: UploadFile = File(...),
    subtitle_id: str = Form(...),
    mode: str = Form("read_aloud"),
    rubric_id: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate mode
    if mode not in VALID_MODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid mode: {mode}. Must be one of: {', '.join(VALID_MODES)}",
        )

    # Validate audio content type
    if audio.content_type and audio.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format: {audio.content_type}. Use WebM, WAV, MP3, or OGG.",
        )

    # Validate file extension
    if audio.filename:
        ext = audio.filename[audio.filename.rfind(".") :].lower()
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

    # Validate subtitle exists and get text
    text_en, video_id = await get_subtitle_text(db, subtitle_id)
    if text_en is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtitle not found")

    # Check free-tier daily limit
    try:
        await check_daily_limit(db, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e

    # Evaluate speaking attempt
    try:
        eval_result = await evaluate_speaking(db, current_user.id, subtitle_id, audio_data, text_en)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except AIServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="评分服务暂时不可用，请稍后重试",
        ) from e

    attempt = eval_result.attempt

    # Set mode and rubric_id on the attempt
    attempt.mode = mode
    if rubric_id:
        attempt.rubric_id = rubric_id
    await db.commit()
    await db.refresh(attempt)

    # Build criteria_scores from the per-attempt evaluation result. (Not persisted
    # to SpeakingAttemptScore in this pass — criteria_scores are returned only for
    # the current attempt; historical attempts rely on the flat accuracy/fluency/
    # completeness columns.)
    criteria_scores = None
    overall_score = None
    if eval_result.criteria_scores:
        criteria_scores = [
            CriterionScore(
                name=c["name"],
                score=c["score"],
                weight=c["weight"],
                feedback=c.get("feedback"),
            )
            for c in eval_result.criteria_scores
        ]
        total_weight = sum(c.weight for c in criteria_scores)
        if total_weight > 0:
            overall_score = round(sum(c.score * c.weight for c in criteria_scores) / total_weight, 1)

    # Update learning record
    await update_learning_record(db, current_user.id, video_id)

    return SpeakingSubmitResponse(
        id=attempt.id,
        accuracy=attempt.accuracy or 0,
        fluency=attempt.fluency or 0,
        completeness=attempt.completeness or 0,
        feedback=attempt.feedback or "",
        transcript=attempt.transcript or "",
        word_scores=attempt.word_scores,
        audio_duration=attempt.audio_duration,
        criteria_scores=criteria_scores,
        overall_score=overall_score,
    )


@router.post("/free-practice", response_model=FreePracticeResponse)
@rate_limit("10/minute")
async def submit_free_practice(
    request: Request,
    audio: UploadFile = File(...),
    mode: str = Form("free_speaking"),
    topic: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Free speaking practice without a video/subtitle reference.

    Accepts audio and an optional topic prompt. Transcribes via Whisper,
    evaluates fluency and provides AI feedback. No word-level accuracy
    or completeness scoring (no reference text to compare against).
    """
    # Validate mode
    if mode != "free_speaking":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid mode: {mode}. Must be 'free_speaking' for this endpoint.",
        )

    # Validate audio content type
    if audio.content_type and audio.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio format: {audio.content_type}. Use WebM, WAV, MP3, or OGG.",
        )

    # Validate file extension
    if audio.filename:
        ext = audio.filename[audio.filename.rfind(".") :].lower()
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

    # Check free-tier daily limit
    try:
        await check_daily_limit(db, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e

    # Evaluate free speaking attempt
    try:
        attempt = await evaluate_free_speaking(db, current_user.id, audio_data, topic=topic)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    return FreePracticeResponse(
        id=attempt.id,
        transcript=attempt.transcript or "",
        fluency=attempt.fluency or 0,
        feedback=attempt.feedback or "",
        audio_duration=attempt.audio_duration,
        mode="free_speaking",
    )


@router.get("/attempts")
@rate_limit("30/minute")
async def list_attempts(
    request: Request,
    page: int = 1,
    page_size: int = 20,
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
        select(func.count(SpeakingAttempt.id)).where(SpeakingAttempt.user_id == current_user.id)
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
    period: str = Query("all", pattern="^(today|week|month|all)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_user_stats(db, current_user.id, period)

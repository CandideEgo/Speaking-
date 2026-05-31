from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.user import User
from app.models.subtitle import Subtitle
from app.models.learning import SpeakingAttempt
from app.schemas.speaking import SpeakingAttemptResponse, SpeakingSubmitResponse
from app.services.speaking_service import evaluate_speaking, get_user_stats
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/speaking", tags=["speaking"])


@router.post("/practice", response_model=SpeakingSubmitResponse)
async def submit_speaking(
    audio: UploadFile = File(...),
    subtitle_id: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
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

    audio_data = await audio.read()
    attempt = await evaluate_speaking(
        db, current_user.id, subtitle_id, audio_data, subtitle.text_en
    )

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

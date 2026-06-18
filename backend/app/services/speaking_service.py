"""Business logic for speaking practice operations.

Route handlers in api/v1/speaking.py delegate to these functions
so HTTP concerns (content-type, size validation) stay in the route
while domain logic (eligibility, evaluation, record-keeping) lives here.
"""

import structlog
import tempfile
import os
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.user import User
from app.models.subtitle import Subtitle
from app.models.learning import SpeakingAttempt, LearningRecord
from app.services.ai_service import get_ai_service
from app.services.transcription.whisper_model import get_whisper_model

logger = structlog.get_logger()

# Free-tier daily limit for speaking practices
FREE_TIER_DAILY_LIMIT = 3


async def check_daily_limit(db: AsyncSession, user: User) -> None:
    """Check if a free-tier user has exceeded their daily speaking limit.

    Raises PermissionError if the limit has been reached.
    """
    if user.plan.value != "free":
        return

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    count_result = await db.execute(
        select(SpeakingAttempt).where(
            SpeakingAttempt.user_id == user.id,
            SpeakingAttempt.created_at >= today,
        )
    )
    today_attempts = len(count_result.scalars().all())
    if today_attempts >= FREE_TIER_DAILY_LIMIT:
        raise PermissionError(
            "Free tier: max 3 speaking practices per day. Upgrade to Pro for unlimited."
        )


async def get_subtitle_text(db: AsyncSession, subtitle_id: str) -> tuple[str | None, str | None]:
    """Fetch a subtitle's English text and video_id.

    Returns (text_en, video_id) or (None, None) if not found.
    """
    result = await db.execute(select(Subtitle).where(Subtitle.id == subtitle_id))
    subtitle = result.scalar_one_or_none()
    if not subtitle:
        return None, None
    return subtitle.text_en, subtitle.video_id


async def evaluate_speaking(
    db: AsyncSession,
    user_id: str,
    subtitle_id: str,
    audio_data: bytes,
    original_text: str,
) -> SpeakingAttempt:
    """Process a speaking attempt: save audio, transcribe, score, return feedback."""

    # Save audio to temp file
    tmp = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
    try:
        tmp.write(audio_data)
        tmp.close()

        # Transcribe via Whisper
        transcript = await _whisper_transcribe(tmp.name)

        # AI feedback
        ai = get_ai_service()
        result = await ai.pronunciation_feedback(original_text, transcript or "")

        attempt = SpeakingAttempt(
            user_id=user_id,
            subtitle_id=subtitle_id,
            transcript=transcript,
            accuracy=result.get("accuracy", 0),
            fluency=result.get("fluency", 0),
            completeness=result.get("completeness", 0),
            feedback=result.get("feedback", ""),
        )
        db.add(attempt)
        await db.commit()
        await db.refresh(attempt)
        return attempt

    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


async def update_learning_record(
    db: AsyncSession,
    user_id: str,
    video_id: str,
) -> None:
    """Update LearningRecord: increment speaking_attempts."""
    lr_result = await db.execute(
        select(LearningRecord).where(
            LearningRecord.user_id == user_id,
            LearningRecord.video_id == video_id,
        )
    )
    record = lr_result.scalar_one_or_none()
    if record:
        record.speaking_attempts += 1
    else:
        db.add(LearningRecord(
            user_id=user_id,
            video_id=video_id,
            speaking_attempts=1,
        ))
    await db.commit()


async def _whisper_transcribe(audio_path: str) -> str:
    """Run Whisper transcription synchronously in a thread."""
    import asyncio

    loop = asyncio.get_event_loop()

    def _sync():
        try:
            model = get_whisper_model()
            segments, _ = model.transcribe(audio_path, language="en")
            return " ".join([s.text for s in segments]).strip()
        except Exception:
            logger.exception("whisper transcribe failed")
            return ""

    return await loop.run_in_executor(None, _sync)


async def get_user_stats(db: AsyncSession, user_id: str) -> dict:
    """Aggregate learning stats for AI assistant."""
    # Speaking attempts this week
    total_attempts_result = await db.execute(
        select(func.count(SpeakingAttempt.id)).where(SpeakingAttempt.user_id == user_id)
    )
    total_attempts = total_attempts_result.scalar() or 0

    # Average accuracy
    avg_result = await db.execute(
        select(func.avg(SpeakingAttempt.accuracy)).where(
            SpeakingAttempt.user_id == user_id,
            SpeakingAttempt.accuracy.isnot(None),
        )
    )
    avg_accuracy = avg_result.scalar() or 0

    return {
        "total_speaking_attempts": total_attempts,
        "average_accuracy": round(float(avg_accuracy), 1),
    }

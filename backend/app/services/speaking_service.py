import logging
import tempfile
import os
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.learning import SpeakingAttempt
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)

_whisper_model = None


def _get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        model_path = os.getenv("WHISPER_MODEL_PATH", "C:/Users/Administrator/local-model/faster-whisper")
        _whisper_model = WhisperModel(model_path, device="cpu", compute_type="int8")
    return _whisper_model


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

        # Transcribe via Whisper (imported in task function)
        transcript = await _whisper_transcribe(tmp.name)

        # AI feedback
        ai = AIService()
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


async def _whisper_transcribe(audio_path: str) -> str:
    """Run Whisper transcription synchronously in a thread."""
    import asyncio

    loop = asyncio.get_event_loop()

    def _sync():
        try:
            model = _get_whisper_model()
            segments, _ = model.transcribe(audio_path, language="en")
            return " ".join([s.text for s in segments]).strip()
        except Exception:
            logger.exception("Whisper transcribe failed")
            return ""

    return await loop.run_in_executor(None, _sync)


async def get_user_stats(db: AsyncSession, user_id: str) -> dict:
    """Aggregate learning stats for AI assistant."""
    from sqlalchemy import func

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

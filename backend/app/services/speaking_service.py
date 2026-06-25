"""Business logic for speaking practice operations.

Route handlers in api/v1/speaking.py delegate to these functions
so HTTP concerns (content-type, size validation) stay in the route
while domain logic (eligibility, evaluation, record-keeping) lives here.
"""

import os
import tempfile
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning import LearningRecord, SpeakingAttempt
from app.models.subtitle import Subtitle
from app.models.user import User
from app.services.ai_service import get_ai_service
from app.services.transcription.whisper_model import get_whisper_model

logger = structlog.get_logger()

# Free-tier daily limit for speaking practices
FREE_TIER_DAILY_LIMIT = 3

# Minimum audio duration for a valid speaking attempt (seconds)
MIN_AUDIO_DURATION = 1.0


async def check_daily_limit(db: AsyncSession, user: User) -> None:
    """Check if a free-tier user has exceeded their daily speaking limit.

    Raises PermissionError if the limit has been reached.
    """
    if user.plan.value != "free":
        return

    today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    count_result = await db.execute(
        select(func.count(SpeakingAttempt.id)).where(
            SpeakingAttempt.user_id == user.id,
            SpeakingAttempt.created_at >= today,
        )
    )
    today_attempts = count_result.scalar() or 0
    if today_attempts >= FREE_TIER_DAILY_LIMIT:
        raise PermissionError("Free tier: max 3 speaking practices per day. Upgrade to Pro for unlimited.")


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
    """Process a speaking attempt: save audio, transcribe, align, score, return feedback.

    The pipeline has three stages:
    1. Acoustic: Whisper transcription with initial_prompt hint + wav2vec2 forced alignment
    2. Metrics: Compute objective metrics (speech rate, pause ratio, word hit rate)
    3. LLM: Feed structured word-level data to AI for grounded feedback

    If alignment fails, falls back to text-only LLM scoring (word_scores=None).
    """

    # Save audio to temp file
    tmp = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
    try:
        tmp.write(audio_data)
        tmp.close()

        # Validate audio duration
        audio_duration = _get_audio_duration(tmp.name)
        if audio_duration < MIN_AUDIO_DURATION:
            raise ValueError(
                f"Audio too short ({audio_duration:.1f}s). Please record at least {MIN_AUDIO_DURATION:.0f} second(s)."
            )

        # Transcribe via Whisper (with initial_prompt for accent adaptation)
        whisper_result = await _whisper_transcribe(tmp.name, original_text)
        transcript = whisper_result["text"]

        # Run forced alignment + compute metrics (with fallback)
        alignment_result = None
        word_scores = None
        metrics = None
        try:
            from app.services.transcription.speaking_alignment import (
                evaluate_speaking_alignment,
            )

            alignment_result = evaluate_speaking_alignment(
                audio_path=tmp.name,
                transcript_segments=whisper_result["segments"],
                original_text=original_text,
                audio_duration=audio_duration,
            )
            if alignment_result:
                word_scores = alignment_result["word_scores"]
                metrics = alignment_result["metrics"]
        except Exception:
            logger.warning("Forced alignment failed, falling back to text-only scoring")

        # AI feedback — use rubric scoring when word-level data is available
        ai = get_ai_service()
        if word_scores and metrics:
            default_criteria = [
                {
                    "name": "Accuracy",
                    "description": "How closely the user's pronunciation matches the original text",
                    "weight": 1.0,
                },
                {"name": "Fluency", "description": "Natural rhythm, pace, and smoothness of speech", "weight": 1.0},
                {
                    "name": "Completeness",
                    "description": "How much of the original text was covered without omissions",
                    "weight": 1.0,
                },
            ]
            result = await ai.pronunciation_feedback_rubric(
                original_text,
                transcript or "",
                rubric_criteria=default_criteria,
                mode="read_aloud",
                word_scores=word_scores,
                metrics=metrics,
            )
        else:
            result = await ai.pronunciation_feedback(original_text, transcript or "")

        attempt = SpeakingAttempt(
            user_id=user_id,
            subtitle_id=subtitle_id,
            transcript=transcript,
            accuracy=result.get("accuracy", 0),
            fluency=result.get("fluency", 0),
            completeness=result.get("completeness", 0),
            feedback=result.get("feedback", ""),
            word_scores=word_scores,
            audio_duration=audio_duration,
        )
        db.add(attempt)

        # Record activity for daily tracking + streak
        from app.services.activity_service import (
            record_speaking_activity,
            update_streak,
        )

        await record_speaking_activity(db, user_id, attempt.accuracy, attempt.fluency, attempt.completeness)
        await update_streak(db, user_id)

        # Single atomic commit: attempt + activity + streak all together
        await db.commit()
        await db.refresh(attempt)

        return attempt

    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


async def evaluate_free_speaking(
    db: AsyncSession,
    user_id: str,
    audio_data: bytes,
    topic: str | None = None,
) -> SpeakingAttempt:
    """Process a free speaking attempt: save audio, transcribe, evaluate fluency, return feedback.

    Unlike evaluate_speaking, there is no reference text to compare against.
    Scoring focuses on fluency only (no accuracy/completeness/word_scores).
    AI evaluates coherence, grammar, vocabulary, and fluency.
    """
    tmp = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
    try:
        tmp.write(audio_data)
        tmp.close()

        # Validate audio duration
        audio_duration = _get_audio_duration(tmp.name)
        if audio_duration < MIN_AUDIO_DURATION:
            raise ValueError(
                f"Audio too short ({audio_duration:.1f}s). Please record at least {MIN_AUDIO_DURATION:.0f} second(s)."
            )

        # Transcribe via Whisper (no initial_prompt since no reference text)
        whisper_result = await _whisper_transcribe(tmp.name, original_text="")
        transcript = whisper_result["text"]

        if not transcript.strip():
            raise ValueError("Could not transcribe audio. Please try again with clearer speech.")

        # AI feedback for free speaking (no word-level alignment needed)
        ai = get_ai_service()
        result = await ai.free_speaking_feedback(transcript, topic=topic)

        attempt = SpeakingAttempt(
            user_id=user_id,
            subtitle_id=None,
            transcript=transcript,
            accuracy=None,
            fluency=result.get("fluency", 0),
            completeness=None,
            feedback=result.get("feedback", ""),
            word_scores=None,
            audio_duration=audio_duration,
            mode="free_speaking",
        )
        db.add(attempt)

        # Record activity for daily tracking + streak
        from app.services.activity_service import (
            record_speaking_activity,
            update_streak,
        )

        await record_speaking_activity(db, user_id, attempt.accuracy, attempt.fluency, attempt.completeness)
        await update_streak(db, user_id)

        # Single atomic commit: attempt + activity + streak all together
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
    """Update LearningRecord: increment speaking_attempts, set timestamps, compute progress."""
    lr_result = await db.execute(
        select(LearningRecord).where(
            LearningRecord.user_id == user_id,
            LearningRecord.video_id == video_id,
        )
    )
    record = lr_result.scalar_one_or_none()
    if record:
        record.speaking_attempts += 1
        record.last_accessed_at = datetime.now(UTC)
    else:
        record = LearningRecord(
            user_id=user_id,
            video_id=video_id,
            speaking_attempts=1,
            last_accessed_at=datetime.now(UTC),
        )
        db.add(record)
        await db.flush()

    # Fix words_learned: count vocabulary words associated with this video
    from app.models.learning import Vocabulary

    vocab_count = await db.execute(
        select(func.count(Vocabulary.id)).where(
            Vocabulary.user_id == user_id,
            Vocabulary.video_id == video_id,
        )
    )
    record.words_learned = vocab_count.scalar() or 0

    # Compute progress_percentage based on subtitles with speaking attempts
    from app.models.subtitle import Subtitle

    total_subtitles_result = await db.execute(select(func.count(Subtitle.id)).where(Subtitle.video_id == video_id))
    total_subtitles = total_subtitles_result.scalar() or 1  # avoid division by zero

    # Count distinct subtitles this user has attempted
    attempted_result = await db.execute(
        select(func.count(SpeakingAttempt.subtitle_id.distinct())).where(
            SpeakingAttempt.user_id == user_id,
            SpeakingAttempt.subtitle_id.in_(select(Subtitle.id).where(Subtitle.video_id == video_id)),
        )
    )
    attempted = attempted_result.scalar() or 0
    record.progress_percentage = round((attempted / total_subtitles) * 100, 1)

    await db.commit()


async def _whisper_transcribe(audio_path: str, original_text: str = "") -> dict:
    """Run Whisper transcription with initial_prompt hint for accent adaptation.

    Args:
        audio_path: Path to the audio file.
        original_text: The reference text the user is reading. Used as
            ``initial_prompt`` to bias Whisper toward the expected vocabulary,
            which significantly improves recognition of accented speech.

    Returns:
        Dict with keys: text, segments, audio_duration.
    """
    import asyncio

    loop = asyncio.get_event_loop()

    def _sync():
        try:
            from app.services.transcription.formatters import faster_whisper_segments_to_dicts

            model = get_whisper_model()
            # Use initial_prompt to help Whisper recognize accented speech
            # by biasing it toward the expected vocabulary.
            prompt = original_text[:200] if original_text else None
            segments, info = model.transcribe(
                audio_path,
                language="en",
                initial_prompt=prompt,
            )
            # Collect segments into a list (generator needs to be consumed)
            seg_list = faster_whisper_segments_to_dicts(segments)

            full_text = " ".join(s["text"] for s in seg_list).strip()
            return {
                "text": full_text,
                "segments": seg_list,
                "audio_duration": info.duration if hasattr(info, "duration") else 0.0,
            }
        except Exception:
            logger.exception("whisper transcribe failed")
            return {"text": "", "segments": [], "audio_duration": 0.0}

    return await loop.run_in_executor(None, _sync)


def _get_audio_duration(audio_path: str) -> float:
    """Get audio duration using ffprobe (same as video duration check)."""
    try:
        from app.services.transcription.audio_extractor import get_video_duration

        return get_video_duration(audio_path)
    except Exception:
        logger.warning("Could not determine audio duration, assuming valid")
        return MIN_AUDIO_DURATION  # Assume valid if we can't check


async def get_user_stats(db: AsyncSession, user_id: str, period: str = "all") -> dict:
    """Aggregate learning stats for a given time period.

    Args:
        period: "today" | "week" | "month" | "all"

    Returns:
        Dict with aggregate stats and optional trend data.
    """
    from app.models.daily_activity import DailyActivity

    # Determine date range
    now = datetime.now(UTC)
    today = now.date()

    if period == "today":
        start_date = today
    elif period == "week":
        start_date = today - timedelta(days=6)  # 7 days including today
    elif period == "month":
        start_date = today - timedelta(days=29)  # 30 days including today
    else:
        start_date = None  # all time

    # ── Aggregate from DailyActivity (fast, pre-computed) ──
    if start_date is not None:
        # Time-bounded query using daily_activities
        da_stmt = select(DailyActivity).where(
            DailyActivity.user_id == user_id,
            DailyActivity.date >= start_date,
        )
    else:
        da_stmt = select(DailyActivity).where(DailyActivity.user_id == user_id)

    da_result = await db.execute(da_stmt.order_by(DailyActivity.date))
    daily_activities = da_result.scalars().all()

    total_speaking = sum(d.speaking_attempts for d in daily_activities)
    total_vocab = 0  # Will query separately
    total_videos = sum(1 for d in daily_activities if d.speaking_attempts > 0 or d.videos_watched > 0)

    # Weighted averages from daily activities
    if total_speaking > 0:
        weighted_acc = sum(
            (d.avg_accuracy or 0) * d.speaking_attempts for d in daily_activities if d.speaking_attempts > 0
        )
        weighted_flu = sum(
            (d.avg_fluency or 0) * d.speaking_attempts for d in daily_activities if d.speaking_attempts > 0
        )
        weighted_comp = sum(
            (d.avg_completeness or 0) * d.speaking_attempts for d in daily_activities if d.speaking_attempts > 0
        )
        avg_accuracy = round(weighted_acc / total_speaking, 1)
        avg_fluency = round(weighted_flu / total_speaking, 1)
        avg_completeness = round(weighted_comp / total_speaking, 1)
    else:
        # Fallback: query SpeakingAttempt directly (for "all" period or sparse data)
        acc_result = await db.execute(
            select(func.avg(SpeakingAttempt.accuracy)).where(
                SpeakingAttempt.user_id == user_id,
                SpeakingAttempt.accuracy.isnot(None),
            )
        )
        flu_result = await db.execute(
            select(func.avg(SpeakingAttempt.fluency)).where(
                SpeakingAttempt.user_id == user_id,
                SpeakingAttempt.fluency.isnot(None),
            )
        )
        comp_result = await db.execute(
            select(func.avg(SpeakingAttempt.completeness)).where(
                SpeakingAttempt.user_id == user_id,
                SpeakingAttempt.completeness.isnot(None),
            )
        )
        avg_accuracy = round(float(acc_result.scalar() or 0), 1)
        avg_fluency = round(float(flu_result.scalar() or 0), 1)
        avg_completeness = round(float(comp_result.scalar() or 0), 1)

    # Vocabulary count (separate query — not in DailyActivity aggregates)
    from app.models.learning import Vocabulary

    vocab_result = await db.execute(select(func.count(Vocabulary.id)).where(Vocabulary.user_id == user_id))
    total_vocab = vocab_result.scalar() or 0

    # Videos watched count
    from app.models.learning import LearningRecord

    videos_result = await db.execute(select(func.count(LearningRecord.id)).where(LearningRecord.user_id == user_id))
    total_videos = videos_result.scalar() or 0

    # ── Build trend data ──
    trend = None
    if period in ("week", "month") and daily_activities:
        trend = {
            "accuracy": [round(d.avg_accuracy or 0, 1) for d in daily_activities],
            "fluency": [round(d.avg_fluency or 0, 1) for d in daily_activities],
            "completeness": [round(d.avg_completeness or 0, 1) for d in daily_activities],
            "dates": [d.date.isoformat() for d in daily_activities],
        }

    return {
        "total_speaking_attempts": total_speaking,
        "average_accuracy": avg_accuracy,
        "average_fluency": avg_fluency,
        "average_completeness": avg_completeness,
        "total_vocabulary": total_vocab,
        "total_videos_watched": total_videos,
        "period": period,
        "trend": trend,
    }

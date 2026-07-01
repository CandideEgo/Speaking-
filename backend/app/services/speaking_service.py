"""Business logic for speaking practice operations.

Route handlers in api/v1/speaking.py delegate to these functions
so HTTP concerns (content-type, size validation) stay in the route
while domain logic (eligibility, evaluation, record-keeping) lives here.
"""

import asyncio
import os
import tempfile
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.models.learning import LearningRecord, SpeakingAttempt
from app.models.subtitle import Subtitle
from app.models.user import User
from app.services.ai_service import AIServiceError, get_ai_service
from app.services.transcription.whisper_model import get_whisper_model

logger = structlog.get_logger()

# Free-tier daily limit for speaking practices
FREE_TIER_DAILY_LIMIT = 3

# Minimum audio duration for a valid speaking attempt (seconds)
MIN_AUDIO_DURATION = 1.0

# Hard timeouts for the synchronous acoustic stages (run in a thread pool).
# Prevents a cold-start model download (wav2vec2 from HF) or a stuck transcribe
# from hanging the request indefinitely.
WHISPER_TRANSCRIBE_TIMEOUT = 120.0  # seconds
FORCED_ALIGNMENT_TIMEOUT = 90.0  # seconds

# Default rubric criteria for read-aloud scoring. Kept as a module constant so
# both the rubric prompt and the criteria_scores assembly share one source of
# truth. (User-selected rubrics / SpeakingAttemptScore persistence are out of
# scope for this pass — criteria_scores are returned per-attempt, not stored.)
DEFAULT_CRITERIA = [
    {
        "name": "Accuracy",
        "description": "How closely the user's pronunciation matches the original text",
        "weight": 1.0,
    },
    {
        "name": "Fluency",
        "description": "Natural rhythm, pace, and smoothness of speech",
        "weight": 1.0,
    },
    {
        "name": "Completeness",
        "description": "How much of the original text was covered without omissions",
        "weight": 1.0,
    },
]


@dataclass
class SpeakingEvalResult:
    """Result of evaluate_speaking: the persisted attempt plus the rubric
    breakdown (criteria_scores + overall_feedback) for the response layer.

    criteria_scores items: {name, score (0-100), feedback, weight}
    """

    attempt: SpeakingAttempt
    criteria_scores: list[dict] = field(default_factory=list)
    overall_feedback: str = ""


def _criterion_score_by_name(criteria_scores: list[dict], name: str) -> float:
    """Find a criterion's score (0-100) by case-insensitive name match."""
    target = name.lower()
    for c in criteria_scores:
        if c.get("criterion_name", "").lower() == target:
            return float(c.get("score", 0))
    return 0.0


def _map_rubric_to_flat(result: dict) -> tuple[float, float, float, str]:
    """Map a rubric result {criteria_scores, overall_feedback} to the flat
    (accuracy, fluency, completeness, feedback) columns stored on SpeakingAttempt.
    """
    criteria = result.get("criteria_scores", [])
    accuracy = _criterion_score_by_name(criteria, "Accuracy")
    fluency = _criterion_score_by_name(criteria, "Fluency")
    completeness = _criterion_score_by_name(criteria, "Completeness")
    feedback = result.get("overall_feedback", "")
    return accuracy, fluency, completeness, feedback


def _assemble_criteria_scores(
    rubric_criteria: list[dict], llm_criteria: list[dict], overall_feedback: str
) -> list[dict]:
    """Merge LLM-returned per-criterion scores with the default criteria
    (which carry the weight), producing the response shape:
    [{name, score, feedback, weight}].
    """
    by_name = {c.get("criterion_name", ""): c for c in llm_criteria}
    assembled = []
    for crit in rubric_criteria:
        name = crit["name"]
        llm = by_name.get(name)
        assembled.append(
            {
                "name": name,
                "score": float(llm.get("score", 0)) if llm else 0.0,
                "feedback": (llm.get("feedback") if llm else None) or overall_feedback,
                "weight": crit.get("weight", 1.0),
            }
        )
    return assembled


def _assemble_criteria_scores_from_flat(
    rubric_criteria: list[dict],
    accuracy: float,
    fluency: float,
    completeness: float,
    feedback: str,
) -> list[dict]:
    """Build a criteria breakdown from the flat (degraded-path) scores so the
    response shape stays consistent with the rubric path.
    """
    flat_map = {"accuracy": accuracy, "fluency": fluency, "completeness": completeness}
    assembled = []
    for crit in rubric_criteria:
        name = crit["name"]
        score = flat_map.get(name.lower(), 0.0)
        assembled.append(
            {
                "name": name,
                "score": float(score),
                "feedback": feedback,
                "weight": crit.get("weight", 1.0),
            }
        )
    return assembled


async def check_daily_limit(db: AsyncSession, user: User) -> None:
    """Check if a free-tier user has exceeded their daily speaking limit.

    Locks the User row to prevent concurrent requests from racing past
    the count check (free users could otherwise exceed the 3-attempt
    limit by sending overlapping requests).

    Raises PermissionError if the limit has been reached.
    """
    if user.plan.value != "free":
        return

    # Lock the user row so concurrent requests serialize on this user
    await db.execute(select(User).where(User.id == user.id).with_for_update())

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
    mode: str = "read_aloud",
    rubric_id: str | None = None,
) -> SpeakingEvalResult:
    """Process a speaking attempt: save audio, transcribe, align, score, return feedback.

    The pipeline has three stages:
    1. Acoustic: Whisper transcription + wav2vec2 forced alignment (both bounded
       by hard timeouts so a cold-start model download can't hang the request)
    2. Metrics: Compute objective metrics (speech rate, pause ratio, word hit rate)
    3. LLM: Feed the alignment data + metrics to the AI for grounded rubric scoring

    If alignment fails, falls back to text-only LLM scoring (word_scores=None),
    but still produces a full criteria breakdown for the response.

    Returns a SpeakingEvalResult (attempt + criteria_scores + overall_feedback).
    """

    tmp = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
    try:
        tmp.write(audio_data)
        tmp.close()

        # Validate audio duration (0.0 on probe failure → rejected below)
        audio_duration = _get_audio_duration(tmp.name)
        if audio_duration < MIN_AUDIO_DURATION:
            raise ValueError(
                f"Audio too short ({audio_duration:.1f}s). Please record at least {MIN_AUDIO_DURATION:.0f} second(s)."
            )

        # Transcribe via Whisper (with initial_prompt for accent adaptation)
        try:
            whisper_result = await _whisper_transcribe(tmp.name, original_text)
        except TimeoutError:
            raise ValueError("语音识别超时，请缩短录音后重试") from None
        transcript = whisper_result["text"]

        # Empty transcript = mic failure / silence / ASR crash. Reject explicitly
        # instead of scoring "original vs empty" (mirrors evaluate_free_speaking).
        if not transcript.strip():
            raise ValueError("无法识别语音内容，请在安静环境重新录制并清晰朗读。")

        # Run forced alignment + compute metrics (with fallback + timeout)
        word_scores = None
        metrics = None
        try:
            from app.services.transcription.speaking_alignment import (
                evaluate_speaking_alignment,
            )

            loop = asyncio.get_event_loop()
            alignment_result = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    evaluate_speaking_alignment,
                    tmp.name,
                    whisper_result["segments"],
                    original_text,
                    audio_duration,
                ),
                timeout=FORCED_ALIGNMENT_TIMEOUT,
            )
            if alignment_result:
                word_scores = alignment_result["word_scores"]
                metrics = alignment_result["metrics"]
        except TimeoutError:
            logger.warning("Forced alignment timed out, falling back to text-only scoring")
        except Exception:
            logger.warning("Forced alignment failed, falling back to text-only scoring", exc_info=True)

        # AI feedback — use rubric scoring when word-level data is available
        ai = get_ai_service()
        criteria_scores: list[dict] = []
        overall_feedback = ""
        if word_scores and metrics:
            result = await ai.pronunciation_feedback_rubric(
                original_text,
                transcript,
                rubric_criteria=DEFAULT_CRITERIA,
                mode="read_aloud",
                word_scores=word_scores,
                metrics=metrics,
            )
            accuracy, fluency, completeness, overall_feedback = _map_rubric_to_flat(result)
            criteria_scores = _assemble_criteria_scores(
                DEFAULT_CRITERIA, result.get("criteria_scores", []), overall_feedback
            )
        else:
            # Degraded path: text-only scoring still returns flat scores; assemble
            # a criteria breakdown from them so the response shape is consistent.
            result = await ai.pronunciation_feedback(original_text, transcript)
            accuracy = float(result.get("accuracy", 0))
            fluency = float(result.get("fluency", 0))
            completeness = float(result.get("completeness", 0))
            overall_feedback = result.get("feedback", "")
            criteria_scores = _assemble_criteria_scores_from_flat(
                DEFAULT_CRITERIA, accuracy, fluency, completeness, overall_feedback
            )

        attempt = SpeakingAttempt(
            user_id=user_id,
            subtitle_id=subtitle_id,
            transcript=transcript,
            accuracy=accuracy,
            fluency=fluency,
            completeness=completeness,
            feedback=overall_feedback,
            word_scores=word_scores,
            audio_duration=audio_duration,
            mode=mode,
            rubric_id=rubric_id,
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
        await commit_refresh(db, attempt)

        return SpeakingEvalResult(
            attempt=attempt,
            criteria_scores=criteria_scores,
            overall_feedback=overall_feedback,
        )

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
        await commit_refresh(db, attempt)

        return attempt

    finally:
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


async def update_learning_record(
    db: AsyncSession,
    user_id: str,
    video_id: str,
) -> None:
    """Update LearningRecord: increment speaking_attempts, set timestamps, compute progress.

    Uses with_for_update() to prevent concurrent requests from creating
    duplicate LearningRecord rows or losing counter increments.
    """
    lr_result = await db.execute(
        select(LearningRecord)
        .where(
            LearningRecord.user_id == user_id,
            LearningRecord.video_id == video_id,
        )
        .with_for_update()
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
        Dict with keys: text, segments, audio_duration. On failure returns an
        empty transcript (the caller guards against empty text).

    Raises:
        TimeoutError if transcription exceeds WHISPER_TRANSCRIBE_TIMEOUT.
    """
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

    return await asyncio.wait_for(loop.run_in_executor(None, _sync), timeout=WHISPER_TRANSCRIBE_TIMEOUT)


def _get_audio_duration(audio_path: str) -> float:
    """Get audio duration using ffprobe (same as video duration check).

    Returns 0.0 on probe failure so the caller's MIN_AUDIO_DURATION check
    rejects the audio, rather than silently assuming a valid 1.0s (which used
    to bypass the check and corrupt downstream speech-rate metrics).
    """
    try:
        from app.services.transcription.audio_extractor import get_video_duration

        return get_video_duration(audio_path)
    except Exception:
        logger.warning("Could not determine audio duration", exc_info=True)
        return 0.0


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

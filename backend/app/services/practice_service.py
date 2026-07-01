"""Practice service — business logic for AI-generated questions per exam level.

Route handlers delegate to these functions so HTTP concerns stay separate from
domain logic.  The service raises ValueError / PermissionError / AIServiceError;
the route layer maps those to HTTP status codes.
"""

import logging
import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import check_video_access, is_video_owner
from app.core.exam_levels import should_display
from app.models.practice import VideoPracticeQuestion
from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus
from app.services import ecdict, exam_corpus
from app.services.ai_service import AIServiceError, get_ai_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def snapshot_practice(snapshot: dict | None, level: str) -> list[dict] | None:
    """Return the frozen practice questions for *level* from a published
    snapshot, or None if the snapshot has none for this level."""
    if not snapshot:
        return None
    by_level = snapshot.get("practice")
    if not by_level:
        return None
    return by_level.get(level)


def should_use_snapshot(video: Video, current_user: User | None) -> bool:
    """A non-owner viewing a UGC video under re-review sees the frozen approved
    snapshot instead of the owner's live draft (mirrors get_video_detail)."""
    return (
        not video.is_official
        and not is_video_owner(video, current_user)
        and video.review_status in (VideoReviewStatus.pending_review.value, VideoReviewStatus.rejected.value)
        and video.published_snapshot is not None
    )


def collect_target_words(subtitles, target_level: str) -> list[dict]:
    """Collect {word, translation} for words whose highest level >= target,
    drawn from the subtitles' word_levels annotations. Returns the ECDICT
    translation for each so the prompt has Chinese context."""
    seen: dict[str, list[str]] = {}
    for sub in subtitles:
        if not sub.word_levels:
            continue
        for surface, levels in sub.word_levels.items():
            if should_display(levels, target_level) and surface not in seen:
                seen[surface] = levels
    words: list[dict] = []
    for surface, _levels in seen.items():
        entry = ecdict.lookup(surface)
        words.append({"word": surface, "translation": entry["translation"] if entry else ""})
        if len(words) >= 30:
            break
    return words


def transcript(subtitles) -> str:
    return " ".join(s.text_en for s in subtitles if s.text_en)


def shuffle_options(options: list[str]) -> None:
    """Shuffle options in place so the correct answer position is random."""
    if len(options) < 2:
        return
    random.shuffle(options)


# ---------------------------------------------------------------------------
# Tiny DB helpers
# ---------------------------------------------------------------------------


async def fetch_subtitles(db: AsyncSession, video_id: str) -> list[Subtitle]:
    """Fetch ordered subtitles for a video. Returns empty list if none."""
    result = await db.execute(select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index))
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Access helpers
# ---------------------------------------------------------------------------


async def get_accessible_video(db: AsyncSession, video_id: str, current_user: User | None = None) -> Video:
    """Fetch a video and verify the caller has access.

    Raises:
        ValueError: video not found
        PermissionError: caller has no access
    """
    video = (await db.execute(select(Video).where(Video.id == video_id))).scalar_one_or_none()
    if not video:
        raise ValueError("Video not found")
    if not check_video_access(video, current_user):
        raise PermissionError("无权访问该视频")
    return video


async def require_editable_own_video(db: AsyncSession, video_id: str, current_user: User) -> Video:
    """Fetch a video owned by the caller; raise if not owned or published.

    Raises:
        PermissionError: not the owner (opaque 404-style, no leak)
        ValueError: video is published (editing blocked)
    """
    video = (await db.execute(select(Video).where(Video.id == video_id))).scalar_one_or_none()
    if not video or not is_video_owner(video, current_user):
        raise PermissionError("Video not found")
    if video.review_status == VideoReviewStatus.published.value:
        raise ValueError("视频已发布，请先调用 begin-edit 触发重新审核后再编辑")
    return video


# ---------------------------------------------------------------------------
# Core: generate + cache (shared by get-practice and regenerate)
# ---------------------------------------------------------------------------


async def generate_and_cache_practice_questions(
    db: AsyncSession,
    video_id: str,
    level: str,
    count: int,
) -> list[dict]:
    """Fetch subtitles → collect words → AI generate → upsert cache → return questions.

    No row locking here — callers handle concurrency (get_or_generate holds
    a row lock on the cache check; regenerate is owner-only).

    Raises:
        ValueError: subtitles not ready, or AI returned empty
        AIServiceError: AI call failed
    """
    subtitles = await fetch_subtitles(db, video_id)
    if not subtitles:
        raise ValueError("字幕尚未就绪，无法生成练习题")

    cet_words = collect_target_words(subtitles, level)
    text = transcript(subtitles)

    # Source layer: pull 真题 sentences containing the target words to seed
    # authentic fill-in-the-blank questions. Non-fatal if corpus is empty.
    exam_examples: list[str] = []
    try:
        exam_examples = await exam_corpus.example_sentences_for_words(
            db, [w["word"] for w in cet_words], level, limit=5
        )
    except Exception:
        pass

    ai = get_ai_service()
    questions = await ai.generate_practice_questions(text, cet_words, level, count, exam_examples=exam_examples)

    if not questions:
        raise ValueError("练习题生成失败，请稍后重试")

    # Upsert: find existing row or create new one.
    cached = (
        await db.execute(
            select(VideoPracticeQuestion).where(
                VideoPracticeQuestion.video_id == video_id,
                VideoPracticeQuestion.exam_level == level,
            )
        )
    ).scalar_one_or_none()
    if cached is None:
        cached = VideoPracticeQuestion(
            video_id=video_id,
            exam_level=level,
            questions=questions,
            question_count=len(questions),
        )
        db.add(cached)
    else:
        cached.questions = questions
        cached.question_count = len(questions)
    await db.commit()
    await db.refresh(cached)
    return cached.questions


# ---------------------------------------------------------------------------
# Composite service functions
# ---------------------------------------------------------------------------


async def get_or_generate_practice(
    db: AsyncSession,
    video_id: str,
    level: str,
    count: int,
    current_user: User,
) -> list[dict]:
    """Return cached practice questions for a level, or generate on first request.

    Handles snapshot logic for UGC videos under re-review and row-level locking
    to prevent concurrent duplicate generation.

    Raises:
        ValueError: video not found, subtitles not ready, AI empty
        PermissionError: no access to video
        AIServiceError: AI call failed
    """
    video = await get_accessible_video(db, video_id, current_user)

    # While a UGC video is under re-review, non-owners read the frozen snapshot
    # (last approved version), not the owner's in-progress draft.
    if should_use_snapshot(video, current_user):
        snap_qs = snapshot_practice(video.published_snapshot, level)
        if snap_qs is not None:
            return snap_qs
        # No snapshot for this level → treat as unavailable.
        raise ValueError("该等级练习题暂不可用")

    # Cached? (lock row to prevent concurrent generation)
    cached = (
        await db.execute(
            select(VideoPracticeQuestion)
            .where(
                VideoPracticeQuestion.video_id == video_id,
                VideoPracticeQuestion.exam_level == level,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if cached:
        return cached.questions

    # Generate + cache.
    return await generate_and_cache_practice_questions(db, video_id, level, count)


async def regenerate_practice_questions(
    db: AsyncSession,
    video_id: str,
    level: str,
    count: int,
    current_user: User,
) -> list[dict]:
    """Regenerate the practice set for a level from scratch via the AI.

    Raises:
        PermissionError: not the owner
        ValueError: video published, not ready, subtitles not ready, AI empty
        AIServiceError: AI call failed
    """
    video = await require_editable_own_video(db, video_id, current_user)
    if video.status != VideoStatus.ready:
        raise ValueError("视频仍在处理中，暂无法生成练习题")

    return await generate_and_cache_practice_questions(db, video_id, level, count)


async def update_practice_set(
    db: AsyncSession,
    video_id: str,
    level: str,
    questions_json: list[dict],
) -> list[dict]:
    """Overwrite (or create) the cached practice set for a level.

    Returns the persisted questions list.
    """
    cached = (
        await db.execute(
            select(VideoPracticeQuestion).where(
                VideoPracticeQuestion.video_id == video_id,
                VideoPracticeQuestion.exam_level == level,
            )
        )
    ).scalar_one_or_none()
    if cached is None:
        cached = VideoPracticeQuestion(
            video_id=video_id,
            exam_level=level,
            questions=questions_json,
            question_count=len(questions_json),
        )
        db.add(cached)
    else:
        cached.questions = questions_json
        cached.question_count = len(questions_json)
    await db.commit()
    await db.refresh(cached)
    return cached.questions


async def grade_answer(question: dict, user_answer: str) -> dict:
    """Grade a single practice answer via the AI service.

    Raises:
        AIServiceError: AI call failed
    """
    ai = get_ai_service()
    return await ai.grade_answer(question, user_answer)


async def build_vocabulary_drill(db: AsyncSession, video_id: str, target_level: str) -> list[dict]:
    """Build deterministic spelling + meaning-choice items from target-level words.

    No AI, no caching. Generates on every call (cheap).

    Raises:
        ValueError: video not accessible, subtitles not ready, no target words
        PermissionError: no access to video
    """
    await get_accessible_video(db, video_id)

    subtitles = await fetch_subtitles(db, video_id)
    if not subtitles:
        raise ValueError("字幕尚未就绪，无法生成词汇练习")

    target_words = collect_target_words(subtitles, target_level)
    if not target_words:
        raise ValueError("该视频暂无目标等级词汇，无法生成练习")

    # Pool of translations for meaning-choice distractors.
    all_translations = [w["translation"] for w in target_words if w["translation"]]

    items: list[dict] = []
    for w in target_words:
        word = w["word"]
        translation = w["translation"] or ""

        # Spelling item: show translation, type the word.
        items.append(
            {
                "kind": "spelling",
                "word": word,
                "translation": translation,
                "answer": word,
                "cet_words": [word],
            }
        )

        # Meaning-choice item: pick the translation for `word`. Distractors are
        # other target words' translations (deduped, up to 3).
        if translation:
            distractors = [t for t in all_translations if t and t != translation]
            distractor_pool = list(dict.fromkeys(distractors))[:3]
            if len(distractor_pool) >= 2:  # need at least 2 distractors to be worthwhile
                options = [*distractor_pool, translation]
                shuffle_options(options)
                items.append(
                    {
                        "kind": "meaning_choice",
                        "word": word,
                        "translation": translation,
                        "answer": translation,
                        "options": options,
                        "cet_words": [word],
                    }
                )

    return items

"""Practice service — unified adaptive drill engine.

Generates practice items from video subtitles or user vocabulary, with
adaptive difficulty based on SM-2 mastery level. All grading is client-side;
this service only generates items and accepts batch SM-2 submissions.

Question types by mastery:
  new / unknown → recognition  (listen_choose_meaning, see_word_choose_meaning)
  learning      → production   (see_meaning_spell_word, listen_spell_word)
  reviewing / mastered → context (context_fill, sentence_repeat)
"""

import logging
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import commit_refresh
from app.core.exam_levels import should_display
from app.models.learning import Vocabulary
from app.models.practice import VideoPracticeQuestion
from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.video import Video, VideoReviewStatus, VideoStatus
from app.services import ecdict, exam_corpus
from app.services.ai_service import AIServiceError, get_ai_service
from app.services.sr_service import calculate_next_review
from app.services.video_access import (
    check_video_access,
    is_video_owner,
    should_use_snapshot,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Mastery → category mapping
MASTERY_TO_CATEGORY = {
    "new": "recognition",
    "learning": "production",
    "reviewing": "context",
    "mastered": "context",
}

# Category → possible types (randomly selected)
CATEGORY_TYPES = {
    "recognition": ["listen_choose_meaning", "see_word_choose_meaning"],
    "production": ["see_meaning_spell_word", "listen_spell_word"],
    "context": ["context_fill", "sentence_repeat"],
}


# ---------------------------------------------------------------------------
# Pure helpers (kept from old service)
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


def collect_target_words(subtitles, target_level: str) -> list[dict]:
    """Collect {word, translation, phonetic} for words whose highest level >= target."""
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
        words.append(
            {
                "word": surface,
                "translation": entry["translation"] if entry else "",
                "phonetic": entry.get("phonetic", "") if entry else "",
            }
        )
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
# Mastery lookup
# ---------------------------------------------------------------------------


async def _get_mastery_map(db: AsyncSession, user_id: str, words: list[dict]) -> dict[str, str]:
    """Return {word: mastery_level} for the given words.

    Words not in the user's vocabulary table default to "new".
    """
    word_set = {w["word"] for w in words}
    result = await db.execute(
        select(Vocabulary.word, Vocabulary.mastery_level).where(
            Vocabulary.user_id == user_id,
            Vocabulary.word.in_(word_set),
        )
    )
    mastery_map = dict(result.all())
    # Default missing words to "new"
    for w in word_set:
        if w not in mastery_map:
            mastery_map[w] = "new"
    return mastery_map


# ---------------------------------------------------------------------------
# Item builders (one per category)
# ---------------------------------------------------------------------------


def _build_recognition_item(word: str, translation: str, phonetic: str, all_translations: list[str]) -> dict:
    """Build a recognition item (listen_choose_meaning or see_word_choose_meaning)."""
    item_type = random.choice(CATEGORY_TYPES["recognition"])

    # Build 4-choice options with distractors
    distractors = [t for t in all_translations if t and t != translation]
    distractor_pool = list(dict.fromkeys(distractors))[:3]
    options = None
    if translation and len(distractor_pool) >= 2:
        options = [*distractor_pool, translation]
        shuffle_options(options)

    return {
        "word": word,
        "category": "recognition",
        "type": item_type,
        "translation": translation,
        "options": options,
        "answer": translation,
        "phonetic": phonetic,
    }


def _build_production_item(word: str, translation: str, phonetic: str) -> dict:
    """Build a production item (see_meaning_spell_word or listen_spell_word)."""
    item_type = random.choice(CATEGORY_TYPES["production"])

    return {
        "word": word,
        "category": "production",
        "type": item_type,
        "translation": translation,
        "options": None,
        "answer": word,
        "phonetic": phonetic,
    }


def _build_context_fill_item(
    word: str,
    translation: str,
    phonetic: str,
    sentence_template: str | None = None,
    options: list[str] | None = None,
) -> dict:
    """Build a context_fill item from a cached or AI-generated template."""
    return {
        "word": word,
        "category": "context",
        "type": "context_fill",
        "translation": translation,
        "options": options,
        "answer": word,
        "sentence_template": sentence_template,
        "phonetic": phonetic,
    }


def _build_sentence_repeat_item(
    word: str,
    translation: str,
    phonetic: str,
    full_sentence: str,
    start_time: float | None,
    end_time: float | None,
) -> dict:
    """Build a sentence_repeat item from a subtitle segment."""
    return {
        "word": word,
        "category": "context",
        "type": "sentence_repeat",
        "translation": translation,
        "options": None,
        "answer": full_sentence,
        "full_sentence": full_sentence,
        "start_time": start_time,
        "end_time": end_time,
        "phonetic": phonetic,
    }


# ---------------------------------------------------------------------------
# Context-fill cache (AI-generated)
# ---------------------------------------------------------------------------


async def _get_or_generate_context_fills(
    db: AsyncSession,
    video_id: str,
    level: str,
    target_words: list[dict],
    subtitles: list[Subtitle],
    count: int = 10,
) -> dict[str, dict]:
    """Return {word: context_fill_dict} for words that have cached/AI-generated fills.

    Only generates context_fill type questions (not the old mixed types).
    """
    # Check cache first
    cached = (
        await db.execute(
            select(VideoPracticeQuestion).where(
                VideoPracticeQuestion.video_id == video_id,
                VideoPracticeQuestion.exam_level == level,
            )
        )
    ).scalar_one_or_none()

    if cached and cached.questions:
        # Cache stores a list of context_fill items; index by word
        fills = {}
        for q in cached.questions:
            if q.get("type") == "context_fill" and q.get("word"):
                fills[q["word"]] = q
        return fills

    # Generate via AI
    text = transcript(subtitles)
    cet_words = [{"word": w["word"], "translation": w["translation"]} for w in target_words]

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
        return {}

    # Filter to only context_fill type from AI output
    context_fills = [q for q in questions if q.get("type") == "context_fill"]

    # Cache the context_fill items (upsert)
    new_cached = VideoPracticeQuestion(
        video_id=video_id,
        exam_level=level,
        questions=context_fills,
        question_count=len(context_fills),
    )
    db.add(new_cached)
    await commit_refresh(db, new_cached)

    fills = {}
    for q in context_fills:
        if q.get("word"):
            fills[q["word"]] = q
    return fills


# ---------------------------------------------------------------------------
# Core: build unified drill (video-scoped)
# ---------------------------------------------------------------------------


async def build_unified_drill(
    db: AsyncSession,
    video_id: str,
    target_level: str,
    current_user: User | None = None,
) -> list[dict]:
    """Build adaptive practice items for a video's target-level words.

    Item types are chosen based on each word's SM-2 mastery_level.
    All grading is client-side; no AI grading involved.

    Raises:
        ValueError: video not accessible, subtitles not ready, no target words
        PermissionError: no access to video
        AIServiceError: AI context_fill generation failed
    """
    video = await get_accessible_video(db, video_id, current_user)

    # Snapshot logic for UGC videos under re-review
    if current_user and should_use_snapshot(video, current_user):
        snap_qs = snapshot_practice(video.published_snapshot, target_level)
        if snap_qs is not None:
            return snap_qs
        raise ValueError("该等级练习题暂不可用")

    subtitles = await fetch_subtitles(db, video_id)
    if not subtitles:
        raise ValueError("字幕尚未就绪，无法生成练习")

    target_words = collect_target_words(subtitles, target_level)
    if not target_words:
        raise ValueError("该视频暂无目标等级词汇，无法生成练习")

    # Get mastery levels for each word (defaults to "new" if not in vocabulary)
    user_id = current_user.id if current_user else None
    mastery_map = {}
    if user_id:
        mastery_map = await _get_mastery_map(db, user_id, target_words)

    # Pool of translations for distractors
    all_translations = [w["translation"] for w in target_words if w["translation"]]

    # Pre-fetch context_fill cache for reviewing/mastered words
    context_words = [w for w in target_words if MASTERY_TO_CATEGORY.get(mastery_map.get(w["word"], "new")) == "context"]
    context_fills = {}
    if context_words:
        try:
            context_fills = await _get_or_generate_context_fills(db, video_id, target_level, context_words, subtitles)
        except AIServiceError:
            logger.warning("Context-fill AI generation failed, falling back to sentence_repeat only")

    # Build subtitle word index for sentence_repeat
    word_subtitles: dict[str, list[Subtitle]] = {}
    for sub in subtitles:
        if not sub.word_levels:
            continue
        for surface in sub.word_levels:
            if surface not in word_subtitles:
                word_subtitles[surface] = []
            word_subtitles[surface].append(sub)

    items: list[dict] = []
    for w in target_words:
        word = w["word"]
        translation = w["translation"] or ""
        phonetic = w.get("phonetic", "") or ""
        mastery = mastery_map.get(word, "new")
        category = MASTERY_TO_CATEGORY.get(mastery, "recognition")

        if category == "recognition":
            items.append(_build_recognition_item(word, translation, phonetic, all_translations))

        elif category == "production":
            items.append(_build_production_item(word, translation, phonetic))

        elif category == "context":
            # Prefer context_fill if available, else sentence_repeat
            fill = context_fills.get(word)
            if fill:
                items.append(
                    _build_context_fill_item(
                        word=word,
                        translation=translation,
                        phonetic=phonetic,
                        sentence_template=fill.get("question"),
                        options=fill.get("options"),
                    )
                )
            else:
                # Fallback: sentence_repeat from a subtitle containing the word
                subs = word_subtitles.get(word, [])
                if subs:
                    # Pick a short subtitle (prefer < 15 words)
                    short_subs = [s for s in subs if len(s.text_en.split()) <= 15]
                    chosen = random.choice(short_subs) if short_subs else random.choice(subs)
                    items.append(
                        _build_sentence_repeat_item(
                            word=word,
                            translation=translation,
                            phonetic=phonetic,
                            full_sentence=chosen.text_en,
                            start_time=chosen.start_time,
                            end_time=chosen.end_time,
                        )
                    )
                else:
                    # No subtitle found — fall back to recognition
                    items.append(_build_recognition_item(word, translation, phonetic, all_translations))

    return items


# ---------------------------------------------------------------------------
# Core: build vocabulary-scoped drill (for /vocabulary page)
# ---------------------------------------------------------------------------


async def build_vocabulary_drill(
    db: AsyncSession,
    user_id: str,
    target_level: str | None = None,
    count: int = 10,
    due_only: bool = False,
) -> list[dict]:
    """Build adaptive practice items from the user's personal vocabulary list.

    Similar to build_unified_drill but sources words from the Vocabulary table
    instead of video subtitles.

    Raises:
        ValueError: no vocabulary words available
    """
    now = datetime.now(UTC)
    stmt = select(Vocabulary).where(Vocabulary.user_id == user_id)

    if due_only:
        stmt = stmt.where((Vocabulary.next_review_at == None) | (Vocabulary.next_review_at <= now))

    stmt = stmt.order_by(Vocabulary.created_at.desc()).limit(count * 3)
    result = await db.execute(stmt)
    words = result.scalars().all()

    if not words:
        raise ValueError("词汇本为空，请先在学习中添加词汇")

    # Prefer enriched words
    enriched = [w for w in words if w.definition and w.translation]
    if len(enriched) >= count:
        selected = enriched[:count]
    else:
        unenriched = [w for w in words if not (w.definition and w.translation)]
        selected = (enriched + unenriched)[:count]

    # Pool of translations for distractors
    all_translations = [w.translation for w in selected if w.translation]

    items: list[dict] = []
    for w in selected:
        word = w.word
        translation = w.translation or ""
        phonetic = w.ipa or ""
        mastery = w.mastery_level or "new"
        category = MASTERY_TO_CATEGORY.get(mastery, "recognition")

        if category == "recognition":
            items.append(_build_recognition_item(word, translation, phonetic, all_translations))
        elif category == "production":
            items.append(_build_production_item(word, translation, phonetic))
        elif category == "context":
            # For vocabulary page, use sentence_repeat with context_sentence if available
            if w.context_sentence:
                items.append(
                    _build_sentence_repeat_item(
                        word=word,
                        translation=translation,
                        phonetic=phonetic,
                        full_sentence=w.context_sentence,
                        start_time=None,
                        end_time=None,
                    )
                )
            else:
                # Fall back to production (spelling)
                items.append(_build_production_item(word, translation, phonetic))

    return items


# ---------------------------------------------------------------------------
# Core: submit practice results → SM-2 update
# ---------------------------------------------------------------------------


async def submit_practice_results(
    db: AsyncSession,
    user_id: str,
    results: list[dict],
    video_id: str | None = None,
) -> dict:
    """Batch-submit practice results and update SM-2 for each word.

    For each {word, correct}:
      1. Look up Vocabulary row. If not found, auto-add.
      2. quality = 5 if correct, 2 if wrong.
      3. Update SM-2 via calculate_next_review.

    Returns:
        {"updated": N, "auto_added": M}
    """
    now = datetime.now(UTC)
    updated = 0
    auto_added = 0

    for r in results:
        word = r["word"]
        correct = r["correct"]
        quality = 5 if correct else 2

        # Look up existing vocabulary row
        result = await db.execute(
            select(Vocabulary).where(
                Vocabulary.user_id == user_id,
                Vocabulary.word == word,
            )
        )
        vocab = result.scalar_one_or_none()

        if not vocab:
            # Auto-add word to vocabulary
            entry = ecdict.lookup(word)
            vocab = Vocabulary(
                user_id=user_id,
                word=word,
                translation=entry["translation"] if entry else "",
                definition=entry.get("definition", "") if entry else "",
                part_of_speech=entry.get("pos", "") if entry else "",
                ipa=entry.get("phonetic", "") if entry else "",
                video_id=video_id,
                mastery_level="new",
                review_count=0,
                ease_factor=2.5,
                interval_days=0,
            )
            db.add(vocab)
            await db.flush()
            auto_added += 1

        # Update SM-2
        current_ef = vocab.ease_factor if vocab.ease_factor else 2.5

        if vocab.review_count > 0:
            if vocab.interval_days and vocab.interval_days > 0:
                interval_days = vocab.interval_days
            elif vocab.last_reviewed_at and vocab.next_review_at:
                interval_days = max((vocab.next_review_at - vocab.last_reviewed_at).days, 1)
            else:
                interval_days = 0
        else:
            interval_days = 0

        next_interval, new_ef, new_review_count = calculate_next_review(
            quality, vocab.review_count, current_ef, interval_days
        )

        vocab.review_count = new_review_count
        vocab.last_reviewed_at = now
        vocab.next_review_at = now + timedelta(days=next_interval)
        vocab.ease_factor = new_ef
        vocab.interval_days = next_interval
        vocab.mastery_level = _mastery_from_review_count(new_review_count)
        updated += 1

    await db.commit()
    return {"updated": updated, "auto_added": auto_added}


def _mastery_from_review_count(review_count: int) -> str:
    """Determine mastery level from review count."""
    if review_count == 0:
        return "new"
    elif review_count <= 2:
        return "learning"
    elif review_count <= 5:
        return "reviewing"
    else:
        return "mastered"


# ---------------------------------------------------------------------------
# Creator: regenerate / edit (context_fill only)
# ---------------------------------------------------------------------------


async def regenerate_practice_questions(
    db: AsyncSession,
    video_id: str,
    level: str,
    count: int,
    current_user: User,
) -> list[dict]:
    """Regenerate context_fill questions for a level from scratch via the AI.

    Raises:
        PermissionError: not the owner
        ValueError: video published, not ready, subtitles not ready, AI empty
        AIServiceError: AI call failed
    """
    video = await require_editable_own_video(db, video_id, current_user)
    if video.status != VideoStatus.ready:
        raise ValueError("视频仍在处理中，暂无法生成练习题")

    subtitles = await fetch_subtitles(db, video_id)
    if not subtitles:
        raise ValueError("字幕尚未就绪，无法生成练习题")

    cet_words = collect_target_words(subtitles, level)
    text = transcript(subtitles)

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

    # Filter to context_fill only
    context_fills = [q for q in questions if q.get("type") == "context_fill"]

    # Upsert cache
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
            questions=context_fills,
            question_count=len(context_fills),
        )
        db.add(cached)
    else:
        cached.questions = context_fills
        cached.question_count = len(context_fills)
    await commit_refresh(db, cached)
    return cached.questions


async def update_practice_set(
    db: AsyncSession,
    video_id: str,
    level: str,
    questions_json: list[dict],
) -> list[dict]:
    """Overwrite (or create) the cached context_fill set for a level.

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
    await commit_refresh(db, cached)
    return cached.questions

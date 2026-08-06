"""Vocabulary practice service — adaptive drill from the user's wordbook.

Generates practice items from the user's personal vocabulary list, with
adaptive difficulty based on SM-2 mastery level. All grading is client-side;
this service only generates items and accepts batch SM-2 submissions.

Question types by mastery:
  new / unknown → recognition  (listen_choose_meaning, see_word_choose_meaning)
  learning      → production   (see_meaning_spell_word, listen_spell_word)
  reviewing / mastered → context (sentence_repeat with the saved context)

Note: the video-scoped practice engine (build_unified_drill / context-fill
generation) was removed when the 试题功能 was taken offline (2026-08); the
video practice endpoints no longer exist. Only the vocabulary drill remains.
"""

import logging
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exam_levels import should_display
from app.models.learning import Vocabulary
from app.services import ecdict
from app.services.sr_service import calculate_next_review

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
    "context": ["sentence_repeat"],
}


def shuffle_options(options: list[str]) -> None:
    """Shuffle options in place so the correct answer position is random."""
    if len(options) < 2:
        return
    random.shuffle(options)


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


def _build_sentence_repeat_item(
    word: str,
    translation: str,
    phonetic: str,
    full_sentence: str,
    start_time: float | None,
    end_time: float | None,
) -> dict:
    """Build a sentence_repeat item from the word's saved context sentence."""
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

    Item types are chosen based on each word's SM-2 mastery level.
    All grading is client-side.

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

    # Filter by target exam level when requested. Words whose ECDICT lookup
    # levels pass should_display() are preferred; if too few match we top up
    # from non-matches so practice still works (e.g. words missing from ECDICT
    # or a level the user hasn't annotated for). Without this the vocabulary
    # drill ignored `target_level` entirely — every level saw the same words.
    if target_level and ecdict.is_available():
        matches: list = []
        misses: list = []
        for w in words:
            entry = ecdict.lookup(w.word)
            levels = entry["levels"] if entry else []
            (matches if should_display(levels, target_level) else misses).append(w)
        if matches:
            # Enough level matches → restrict to them; only top up with misses
            # when matches alone can't fill the requested count.
            words = matches if len(matches) >= count else matches + misses

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
            # Auto-add word to vocabulary. ecdict's ``pos`` can be a long
            # multi-tag string (e.g. "i:10/n:1/r:87/j:1/v:1") that exceeds the
            # String(20) column, so truncate to fit and avoid a flush error.
            entry = ecdict.lookup(word)
            raw_pos = entry.get("pos", "") if entry else ""
            vocab = Vocabulary(
                user_id=user_id,
                word=word[:100],
                translation=(entry["translation"] if entry else "")[:500],
                definition=entry.get("definition", "") if entry else "",
                part_of_speech=raw_pos[:20],
                ipa=(entry.get("phonetic", "") if entry else "")[:100],
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

    # Emit learning events (ADR-0012 learning plan integration)
    try:
        from app.services.learning_event_service import EVENT_LEARNED_WORDS, EVENT_PRACTICED_ITEMS, emit_event

        correct_count = sum(1 for r in results if r.get("correct"))
        await emit_event(db, user_id, EVENT_PRACTICED_ITEMS, len(results), video_id=video_id)
        if correct_count > 0:
            await emit_event(db, user_id, EVENT_LEARNED_WORDS, correct_count, video_id=video_id)
        # Update Vocabulary.correct_count for each correct answer
        for r in results:
            if r.get("correct"):
                v_result = await db.execute(
                    select(Vocabulary).where(
                        Vocabulary.user_id == user_id,
                        Vocabulary.word == r["word"],
                    )
                )
                v = v_result.scalar_one_or_none()
                if v:
                    v.correct_count = (v.correct_count or 0) + 1
        await db.commit()
    except Exception:
        logger.exception("Failed to emit learning events for practice results")

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

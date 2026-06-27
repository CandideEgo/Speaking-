"""真题 (past-paper) corpus queries and population helpers.

Read side (used by the gloss endpoint & practice generation):
  * find_example_sentence(word, levels) -> ExamSentence | None
  * is_high_freq_word(word, levels) -> bool
  * example_sentences_for_words(words, level, limit) -> list[str]

Write side (used by the ETL script):
  * ingest_sentences(db, records) -> (inserted, updated)  — upserts sentences,
    rebuilds the word index for the touched levels, and recomputes freq.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from sqlalchemy import delete, func, select

from app.models.exam_corpus import ExamSentence, ExamSentenceWord, ExamWordFreq
from app.services import ecdict

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

# A word in a sentence (letters/apostrophes), reused from ecdict's tokenizer.
_WORD_RE = re.compile(r"[A-Za-z']+")

# Threshold for the "高频" (high-frequency) badge: a word is 高频 in a level
# if it appears in >= this many 真题 sentences for that level. Tunable.
HIGH_FREQ_THRESHOLD = 3


def _clean(token: str) -> str:
    return re.sub(r"[^a-z']", "", token.lower())


async def find_example_sentence(db: AsyncSession, word: str, levels: list[str] | None = None) -> ExamSentence | None:
    """Return a 真题 sentence containing ``word``.

    ``levels`` optionally restricts to the given exam levels; if omitted, any
    level matches. A word's ECDICT levels rarely line up exactly with the level
    a 真题 sentence was tagged at (ECDICT over-tags: most cet6 words also carry
    ielts/gre), so callers should pass the word's ECDICT levels and accept a
    match in any of them — otherwise almost no examples would resolve.
    """
    clean = _clean(word)
    if not clean:
        return None
    stmt = (
        select(ExamSentence)
        .join(ExamSentenceWord, ExamSentenceWord.sentence_id == ExamSentence.id)
        .where(ExamSentenceWord.word == clean)
    )
    if levels:
        stmt = stmt.where(ExamSentence.level.in_(levels))
    stmt = stmt.order_by(ExamSentence.year.desc().nullslast()).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none()


async def is_high_freq_word(db: AsyncSession, word: str, levels: list[str] | None = None) -> bool:
    """True if ``word`` appears in >= HIGH_FREQ_THRESHOLD 真题 sentences.

    Sums frequency across the given ``levels`` (or all levels if omitted), so a
    word flagged cet4 by ECDICT but appearing in cet4 真题 still counts even
    when its top ECDICT level is gre.
    """
    clean = _clean(word)
    if not clean:
        return False
    stmt = select(func.sum(ExamWordFreq.freq)).where(ExamWordFreq.word == clean)
    if levels:
        stmt = stmt.where(ExamWordFreq.level.in_(levels))
    row = (await db.execute(stmt)).first()
    total = int(row[0]) if row and row[0] else 0
    return total >= HIGH_FREQ_THRESHOLD


async def example_sentences_for_words(db: AsyncSession, words: list[str], level: str, limit: int = 5) -> list[str]:
    """Return up to ``limit`` 真题 English sentences containing any of ``words``."""
    cleaned = [w for w in (_clean(x) for x in words) if w]
    if not cleaned:
        return []
    stmt = (
        select(ExamSentence.sentence_en)
        .join(ExamSentenceWord, ExamSentenceWord.sentence_id == ExamSentence.id)
        .where(ExamSentenceWord.word.in_(cleaned), ExamSentence.level == level)
        .distinct()
        .limit(limit)
    )
    return [r[0] for r in (await db.execute(stmt)).all()]


async def recompute_freq_for_levels(db: AsyncSession, levels: set[str]) -> None:
    """Recompute exam_word_freq from the sentence-word index for given levels."""
    for level in levels:
        await db.execute(delete(ExamWordFreq).where(ExamWordFreq.level == level))
        # Count word occurrences per level via the join.
        stmt = (
            select(ExamSentenceWord.word, func.count(ExamSentenceWord.id))
            .join(ExamSentence, ExamSentence.id == ExamSentenceWord.sentence_id)
            .where(ExamSentence.level == level)
            .group_by(ExamSentenceWord.word)
        )
        for word, cnt in (await db.execute(stmt)).all():
            db.add(ExamWordFreq(word=word, level=level, freq=int(cnt)))
    await db.flush()


async def ingest_sentences(db: AsyncSession, records: list[dict]) -> tuple[int, set[str]]:
    """Upsert 真题 sentences, index their exam words, recompute freq.

    Each record: {level, year?, month?, question_type?, sentence_en, sentence_zh?, source?}.
    Dedups by (level, sentence_en) so re-running the ETL is idempotent. Returns
    (sentence_count, levels_touched).
    """
    levels: set[str] = set()
    inserted = 0
    for rec in records:
        level = rec.get("level")
        en = (rec.get("sentence_en") or "").strip()
        if not level or not en:
            continue
        # Idempotent: skip if this exact sentence already ingested for the level.
        existing = (
            await db.execute(select(ExamSentence.id).where(ExamSentence.level == level, ExamSentence.sentence_en == en))
        ).first()
        if existing:
            continue
        sentence = ExamSentence(
            level=level,
            year=rec.get("year"),
            month=rec.get("month"),
            question_type=rec.get("question_type"),
            sentence_en=en,
            sentence_zh=rec.get("sentence_zh"),
            source=rec.get("source"),
        )
        # Index exam words present in the sentence (ECDICT-tagged only).
        words: set[str] = set()
        for token in _WORD_RE.findall(en):
            entry = ecdict.lookup(token)
            if entry:
                words.add(_clean(entry["lemma"]))
        for w in words:
            sentence.words.append(ExamSentenceWord(word=w))
        db.add(sentence)
        levels.add(level)
        inserted += 1
    await db.flush()
    if levels:
        await recompute_freq_for_levels(db, levels)
    await db.commit()
    return inserted, levels

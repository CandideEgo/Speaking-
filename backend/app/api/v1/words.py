"""Exam-vocabulary word gloss endpoint.

Serves the rich click-popup on the watch page: merges static ECDICT data
(phonetic / POS / definitions / exam levels — instant, local), pre-generated
AI learning notes from ``word_ai_notes`` (video-specific → global, <10ms),
the real-time AI fallback (writes the ``global`` note on miss so the next
lookup is instant), and 真题 (past-paper) example sentences + high-frequency
badge from the exam corpus.
"""

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.services import ecdict, exam_corpus, word_notes
from app.services.ai_service import get_ai_service

router = APIRouter(prefix="/words", tags=["words"])


class WordGloss(BaseModel):
    word: str
    lemma: str | None = None
    phonetic: str | None = None
    pos: str | None = None
    definition: str | None = None  # English definition (ECDICT)
    translation: str | None = None  # Chinese translation (ECDICT)
    levels: list[str] = []
    example_sentence: str | None = None  # 真题例句 (exam corpus)
    example_sentence_zh: str | None = None  # 真题例句译文
    example_source: str | None = None  # 真题来源标注
    is_high_freq: bool = False  # 真题高频徽标
    contextual_note: str | None = None  # AI: meaning in this context
    pitfalls: str | None = None  # AI: common mistakes
    knowledge: str | None = None  # AI: usage extension


@router.get("/gloss", response_model=WordGloss)
@rate_limit("30/minute")
async def gloss_word(
    request: Request,
    word: str = Query(..., min_length=1, max_length=100),
    context_sentence: str = Query(default="", max_length=2000),
    video_id: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return ECDICT static data + pre-generated AI notes + 真题 example."""
    clean = word.strip().strip(".,!?;:'\"()[]")
    entry = ecdict.lookup(clean) if clean else None
    lemma = (entry.get("lemma") if entry else None) or clean

    # 真题 example + high-freq badge. Non-fatal if corpus is empty.
    example_sentence = None
    example_sentence_zh = None
    example_source = None
    is_high_freq = False
    if entry:
        word_levels = entry.get("levels") or []
        if word_levels:
            try:
                sent = await exam_corpus.find_example_sentence(db, lemma, word_levels)
                if sent:
                    example_sentence = sent.sentence_en
                    example_sentence_zh = sent.sentence_zh
                    example_source = sent.source
                is_high_freq = await exam_corpus.is_high_freq_word(db, lemma, word_levels)
            except Exception:
                pass

    # AI notes: video-specific → global → live fallback.
    # Live fallback writes a global row so the next click is instant.
    contextual_note = pitfalls = knowledge = None
    try:
        cached = await word_notes.get_best_note(db, lemma, video_id)
        if cached:
            contextual_note = cached["contextual_note"]
            pitfalls = cached["pitfalls"]
            knowledge = cached["knowledge"]
        else:
            ai = get_ai_service()
            notes = await ai.gloss_word_context(lemma, context_sentence)
            contextual_note = notes.get("contextual_note") or None
            pitfalls = notes.get("pitfalls") or None
            knowledge = notes.get("knowledge") or None
            # Persist as a global note so subsequent lookups (any video) skip AI.
            if lemma and (contextual_note or pitfalls or knowledge):
                # Use the word's highest ECDICT level so global notes are
                # queryable by (word, level) too.
                from app.core.exam_levels import display_level

                top = display_level(entry.get("levels") or []) if entry else None
                await word_notes.upsert_notes(
                    db,
                    [
                        {
                            "word": lemma,
                            "level": top or "global",
                            "context_source": word_notes.GLOBAL_SOURCE,
                            "contextual_note": contextual_note or "",
                            "pitfalls": pitfalls or "",
                            "knowledge": knowledge or "",
                        }
                    ],
                )
    except Exception:
        pass

    return WordGloss(
        word=word,
        lemma=entry.get("lemma") if entry else None,
        phonetic=entry.get("phonetic") if entry else None,
        pos=entry.get("pos") if entry else None,
        definition=entry.get("definition") if entry else None,
        translation=entry.get("translation") if entry else None,
        levels=entry.get("levels") or [] if entry else [],
        example_sentence=example_sentence,
        example_sentence_zh=example_sentence_zh,
        example_source=example_source,
        is_high_freq=is_high_freq,
        contextual_note=contextual_note,
        pitfalls=pitfalls,
        knowledge=knowledge,
    )

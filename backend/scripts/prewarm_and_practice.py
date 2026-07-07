"""Run annotating + prewarm_notes + practice_questions for the 5 official videos.

These steps were skipped when we reprocessed subtitles directly. This script
fills in the missing pipeline outputs:
  1. annotating  — ECDICT local annotation → Subtitle.word_levels
  2. prewarm     — AI word notes → word_ai_notes (source=video:{id})
  3. practice    — AI context_fill questions → video_practice_questions

Usage:
    cd backend
    PYTHONUTF8=1 .venv/Scripts/python.exe scripts/prewarm_and_practice.py
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, ".")

VIDEO_IDS = [
    "85cb45ae-06bd-4236-a7ea-ee7fe80cd5c1",  # entrepreneur_15min
    "99728b5c-cb59-47b8-8d2a-60a5f220051c",  # vlog_19min
    "74b7afab-9d17-4f7d-b071-bc09f70b76a7",  # anthropic_52min
    "bdebe210-7985-4102-a2ba-234c3741b9c5",  # german_japan_19min
    "237f80a4-dced-4be7-9159-a1c8983f24ab",  # drawing_12min
]

# Levels to pre-generate practice questions for (mainstream ones)
PRACTICE_LEVELS = ["gaoKao", "cet4", "cet6", "ky"]
PRACTICE_COUNT_PER_LEVEL = 10


async def run_annotating(db, video_id: str) -> int:
    """Fill Subtitle.word_levels via ECDICT. Returns count of annotated subs."""
    from sqlalchemy import select

    from app.models.subtitle import Subtitle
    from app.services import ecdict

    if not ecdict.is_available():
        print("    ECDICT not available, skipping annotating")
        return 0

    result = await db.execute(select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index))
    subs = list(result.scalars().all())
    count = 0
    for s in subs:
        levels = ecdict.annotate_text(s.text_en)
        s.word_levels = levels or None
        if s.word_levels:
            count += 1
    await db.commit()
    return count


async def run_prewarm(db, video_id: str) -> int:
    """Run prewarm_video_notes. Returns count of notes generated."""
    from app.services.word_notes import prewarm_video_notes

    return await prewarm_video_notes(db, video_id)


async def run_practice(db, video_id: str, level: str, count: int) -> int:
    """Generate context_fill practice questions for one (video, level). Returns count."""
    from sqlalchemy import select

    from app.models.practice import VideoPracticeQuestion
    from app.services import ecdict, exam_corpus
    from app.services.ai_service import get_ai_service
    from app.services.practice_service import collect_target_words, fetch_subtitles, transcript

    subtitles = await fetch_subtitles(db, video_id)
    if not subtitles:
        print(f"      [{level}] no subtitles, skipping")
        return 0

    target_words = collect_target_words(subtitles, level)
    if not target_words:
        print(f"      [{level}] no target words at this level, skipping")
        return 0

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
        print(f"      [{level}] already cached ({cached.question_count} questions)")
        return cached.question_count

    text = transcript(subtitles)
    cet_words = [{"word": w["word"], "translation": w["translation"]} for w in target_words]

    exam_examples: list[str] = []
    try:
        exam_examples = await exam_corpus.example_sentences_for_words(
            db, [w["word"] for w in cet_words], level, limit=5
        )
    except Exception as e:
        print(f"      [{level}] exam_examples failed: {e}")

    ai = get_ai_service()
    questions = await ai.generate_practice_questions(text, cet_words, level, count, exam_examples=exam_examples)

    if not questions:
        print(f"      [{level}] AI returned no questions")
        return 0

    context_fills = [q for q in questions if q.get("type") == "context_fill"]

    # Upsert cache
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
    await db.commit()
    return len(context_fills)


async def main():
    from app.core.database import get_session_maker

    SessionMaker = get_session_maker()

    for video_id in VIDEO_IDS:
        print(f"\n{'=' * 60}")
        print(f"  Video: {video_id}")
        print(f"{'=' * 60}")

        async with SessionMaker() as db:
            # Step 1: annotating
            print("  [1/3] annotating (ECDICT)...")
            t0 = time.time()
            ann_count = await run_annotating(db, video_id)
            print(f"    {ann_count} subtitles with word_levels ({time.time() - t0:.1f}s)")

            # Step 2: prewarm
            print("  [2/3] prewarm_notes (AI word notes)...")
            t1 = time.time()
            try:
                note_count = await run_prewarm(db, video_id)
                print(f"    {note_count} notes generated ({time.time() - t1:.1f}s)")
            except Exception as e:
                print(f"    prewarm FAILED: {e}")

            # Step 3: practice questions
            print(f"  [3/3] practice questions (levels: {PRACTICE_LEVELS})...")
            for level in PRACTICE_LEVELS:
                t2 = time.time()
                try:
                    q_count = await run_practice(db, video_id, level, PRACTICE_COUNT_PER_LEVEL)
                    print(f"      [{level}] {q_count} questions ({time.time() - t2:.1f}s)")
                except Exception as e:
                    print(f"      [{level}] FAILED: {e}")


if __name__ == "__main__":
    asyncio.run(main())

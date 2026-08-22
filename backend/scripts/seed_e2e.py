"""Seed a minimal official "ready" video + bilingual subtitles for CI e2e tests.

The Playwright watch-page tests skip when the home page has no video link; CI
starts from an empty database, so without a seed those tests never execute in
CI (the core watch journey was silently uncovered). This script creates one
official ready video with subtitles — no network, no GPU, no media file — and
is idempotent (exits 0 if a suitable video already exists).

Usage:
    cd backend && python scripts/seed_e2e.py

Runs against the configured DATABASE_URL (CI sets it for the e2e job).
"""

import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

# Make `app` importable when run as `python scripts/seed_e2e.py` from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import async_session
from app.models.exam_test import ExamPaper, ExamQuestion
from app.models.subtitle import Subtitle
from app.models.video import Video, VideoReviewStatus, VideoSource, VideoStatus

TITLE = "E2E Demo Video (CI seed)"

# Distinctive set_no so the demo paper never collides with real imported papers.
_E2E_PAPER_KEY = dict(level="cet4", year=2020, month=1, set_no=99)

# Covers all three reading sections: cloze (options derived from the
# [word bank] appendix), matching (options derived from paragraph letters),
# and plain multiple-choice reading_C. The e2e exam spec answers every
# question, so a section without answerable options would fail the run.
_E2E_QUESTIONS = [
    {
        "section": "reading_A",
        "number": 26,
        "question_type": "cloze",
        "passage": (
            "The team 26 a new plan to improve service quality.\n\n"
            "Customers often 27 when support takes too long."
            "\n\n[word bank]\nA) launched\nB) complain\nC) celebrate"
        ),
        "question": None,
        "options": None,
        "answer": "A",
        "explanation": "launched 符合语境（启动新计划）。",
    },
    {
        "section": "reading_A",
        "number": 27,
        "question_type": "cloze",
        "passage": "",
        "question": None,
        "options": None,
        "answer": "B",
        "explanation": "complain 符合语境（抱怨等待太久）。",
    },
    {
        "section": "reading_B",
        "number": 36,
        "question_type": "matching",
        "passage": (
            "A) The first paragraph describes an early experiment.\n\n"
            "B) The second paragraph reports the final results.\n\n"
            "C) The third paragraph lists future directions."
        ),
        "question": "Which paragraph reports the final results?",
        "options": None,
        "answer": "B",
        "explanation": "段落 B 描述了最终结果。",
    },
    {
        "section": "reading_B",
        "number": 37,
        "question_type": "matching",
        "passage": "",
        "question": "Which paragraph lists future directions?",
        "options": None,
        "answer": "C",
        "explanation": "段落 C 描述了未来方向。",
    },
    {
        "section": "reading_C",
        "number": 46,
        "question_type": "reading",
        "passage": "Regular exercise improves both physical and mental health.",
        "question": "What does the passage say about exercise?",
        "options": {
            "A": "It only helps the body.",
            "B": "It improves physical and mental health.",
            "C": "It has no proven benefit.",
            "D": "It replaces medical treatment.",
        },
        "answer": "B",
        "explanation": "原文直接说明锻炼改善身心。",
    },
    {
        "section": "reading_C",
        "number": 47,
        "question_type": "reading",
        "passage": "",
        "question": "What is the tone of the passage?",
        "options": {
            "A": "Informative.",
            "B": "Sarcastic.",
            "C": "Doubtful.",
            "D": "Humorous.",
        },
        "answer": "A",
        "explanation": "说明性语气。",
    },
]

# (start, end, en, zh) — four short bilingual sentences so the watch page has
# something to render and subtitle navigation has room to move.
_DEMO_SUBTITLES = [
    (0.0, 4.2, "Hello and welcome to today's lesson.", "大家好，欢迎来到今天的课程。"),
    (4.2, 8.5, "Today we are going to practice English together.", "今天我们将一起练习英语。"),
    (8.5, 12.0, "Remember to repeat each sentence out loud.", "记住要大声重复每个句子。"),
    (12.0, 16.0, "This is the last sentence of the demo.", "这是演示的最后一句。"),
]


async def seed_exam_paper(db) -> None:
    """Idempotent: one demo paper so the exam e2e spec has a full journey."""
    existing = await db.scalar(select(ExamPaper).filter_by(**_E2E_PAPER_KEY))
    if existing is not None:
        print(f"seed_e2e: exam paper already present ({existing.id}) — skipping")
        return
    paper = ExamPaper(
        **_E2E_PAPER_KEY,
        title="E2E Demo Paper (CI seed)",
        source="seed_e2e",
        total_questions=len(_E2E_QUESTIONS),
    )
    db.add(paper)
    await db.flush()
    # Section A cloze shares one passage; matching shares one too. Repeat
    # questions carry an empty passage and inherit the section's passage at
    # render time (ExamRunner groups by section). Fill the shared passage
    # into the first question of each section only.
    seen_sections: set[str] = set()
    for q in _E2E_QUESTIONS:
        passage = q["passage"]
        if q["section"] in seen_sections:
            passage = ""
        seen_sections.add(q["section"])
        db.add(
            ExamQuestion(
                paper_id=paper.id,
                section=q["section"],
                number=q["number"],
                question_type=q["question_type"],
                passage=passage or None,
                question=q["question"],
                options=q["options"],
                answer=q["answer"],
                explanation=q["explanation"],
            )
        )
    print(f"seed_e2e: created exam paper {paper.id} with {len(_E2E_QUESTIONS)} questions")


async def seed_video(db) -> None:
    """Idempotent: one official ready video so the watch e2e spec can run."""
    existing = await db.scalar(
        select(Video).where(
            Video.is_official.is_(True),
            Video.status == VideoStatus.ready,
        )
    )
    if existing is not None:
        print(f"seed_e2e: official ready video already present ({existing.id}) — skipping")
        return

    video = Video(
        title=TITLE,
        source_url="https://example.com/e2e-demo.mp4",
        video_source=VideoSource.imported,
        status=VideoStatus.ready,
        review_status=VideoReviewStatus.published.value,
        is_official=True,
        is_featured=True,
        show_on_homepage=True,
        duration=16.0,
    )
    db.add(video)
    await db.flush()
    # Placeholder media URL — the e2e suite asserts page behavior, not
    # playback; the file itself is not required.
    video.video_url_720p = f"/media/{video.id}.mp4"

    for i, (start, end, en, zh) in enumerate(_DEMO_SUBTITLES):
        db.add(
            Subtitle(
                video_id=video.id,
                start_time=start,
                end_time=end,
                text_en=en,
                text_zh=zh,
                sentence_index=i,
            )
        )
    print(f"seed_e2e: created official ready video {video.id} with {len(_DEMO_SUBTITLES)} subtitles")


async def main() -> int:
    async with async_session() as db:
        await seed_video(db)
        await seed_exam_paper(db)
        await db.commit()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except Exception as exc:  # fail loudly — CI depends on this seed
        print(f"seed_e2e: FAILED: {exc}", file=sys.stderr)
        sys.exit(1)

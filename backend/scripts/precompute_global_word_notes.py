#!/usr/bin/env python
"""One-shot preheat of global AI learning notes for every ECDICT exam word.

Generates context-agnostic contextual_note / pitfalls / knowledge for every
word ECDICT tagged with an exam level (cet4/cet6/ky/gaoKao/zhongkao/ielts/
toefl/gre), and stores them as ``word_ai_notes`` rows with
``context_source='global'``. Idempotent — re-running only fills missing rows.

After this script finishes, the gloss endpoint serves the
contextual_note/pitfalls/knowledge fields for any exam word without making
LLM calls (subject to the per-video note taking precedence when available).

Usage:
    cd backend
    python scripts/precompute_global_word_notes.py            # process all
    python scripts/precompute_global_word_notes.py --limit 500  # first 500
    python scripts/precompute_global_word_notes.py --levels cet4 cet6  # specific levels
    python scripts/precompute_global_word_notes.py --batch-size 20
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from app.core.database import async_session
from app.models.word_note import WordAINote
from app.services import ecdict
from app.services.ai_service import AIService
from app.services.word_notes import GLOBAL_SOURCE, upsert_notes

LEVEL_ORDER = {"zhongkao": 1, "gaoKao": 2, "cet4": 3, "cet6": 4, "ky": 5, "ielts": 6, "toefl": 6, "gre": 7}


def _highest_level(levels: list[str]) -> str:
    if not levels:
        return "global"
    return max(levels, key=lambda lv: LEVEL_ORDER.get(lv, 0))


async def _existing_words(db, levels: list[str] | None) -> set[str]:
    """Words that already have a global note — skip them on re-run."""
    stmt = select(WordAINote.word).where(WordAINote.context_source == GLOBAL_SOURCE)
    if levels:
        stmt = stmt.where(WordAINote.level.in_(levels))
    return {(r[0]).lower() for r in (await db.execute(stmt)).all()}


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=0, help="max words to process (0 = all)")
    parser.add_argument("--levels", nargs="+", default=None, help="restrict to these levels (e.g. cet4 cet6)")
    parser.add_argument("--batch-size", type=int, default=15, help="words per LLM call")
    parser.add_argument("--rate", type=float, default=0.0, help="sleep seconds between batches (rate limiting)")
    args = parser.parse_args()

    if not ecdict.is_available():
        print(f"[error] ECDICT db not found at {ecdict.DB_PATH}", file=sys.stderr)
        return 1
    ecdict.get_index()  # build index

    async with async_session() as db:
        existing = await _existing_words(db, args.levels)
        all_words = [
            (lemma, entry["levels"])
            for lemma, entry in ecdict.get_index().words.items()
            if (not args.levels or any(lv in args.levels for lv in entry["levels"]))
        ]
        all_words.sort(key=lambda x: x[0])
        todo = [(lemma, lv) for lemma, lv in all_words if lemma not in existing]
        already = len(all_words) - len(todo)
        if args.limit:
            todo = todo[: args.limit]
        total = len(all_words)
        print(
            f"[plan] {total} exam words; "
            f"{len(todo)} to process; {already} already have global notes"
            + (f" (--limit {args.limit} truncates the run)" if args.limit else "")
        )

        if not todo:
            print("[done] nothing to do")
            return 0

        ai = AIService()
        # Batch by --batch-size. Each item: word, translation, context_sentence
        # (context_sentence stays empty for global notes — that's the point).
        items = []
        for lemma, levels in todo:
            ecdict.get_index().words[lemma]  # ensure loaded
            items.append(
                {
                    "word": lemma,
                    "level": _highest_level(levels),
                    "context_sentence": "",
                }
            )
        processed = 0
        errors = 0
        t0 = time.perf_counter()
        for batch_start in range(0, len(items), args.batch_size):
            batch = items[batch_start : batch_start + args.batch_size]
            try:
                notes = await ai.generate_word_notes_bulk(batch, source=GLOBAL_SOURCE, level="global")
                await upsert_notes(db, notes)
                processed += len(notes)
                print(f"[{processed}/{len(items)}] +{len(notes)} words (elapsed {time.perf_counter() - t0:.0f}s)")
            except Exception as exc:
                errors += 1
                print(f"[error] batch @ {batch_start}: {exc}", file=sys.stderr)
            if args.rate:
                await asyncio.sleep(args.rate)

        print(f"[done] processed={processed} errors={errors} elapsed={time.perf_counter() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

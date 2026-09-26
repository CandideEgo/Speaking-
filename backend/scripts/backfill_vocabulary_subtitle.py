#!/usr/bin/env python
"""Backfill Vocabulary.subtitle_id for existing words (词→句链路 S7a).

New words get their subtitle_id written at creation (watch-page click passes
it; sieve collect writes the first-appearance sentence). Existing rows only
carry ``(video_id, context_sentence)`` — this script matches that pair against
the ``subtitles`` table and fills the missing subtitle_id.

Matching is exact on ``text_en`` first, then whitespace/case-insensitive as a
fallback. Unmatched rows stay NULL on purpose: the frontend simply hides the
「回到对应句子」 entry when subtitle_id is missing.

Usage:
    cd backend
    python scripts/backfill_vocabulary_subtitle.py            # dry-run, prints match rate
    python scripts/backfill_vocabulary_subtitle.py --apply    # write matched rows
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from app.core.database import async_session
from app.models.learning import Vocabulary
from app.models.subtitle import Subtitle


def _norm(text: str) -> str:
    """Whitespace/case-insensitive key for the fallback match."""
    return " ".join(text.split()).lower()


async def backfill(apply: bool) -> None:
    async with async_session() as db:
        vocab_rows = (
            (
                await db.execute(
                    select(Vocabulary).where(
                        Vocabulary.subtitle_id.is_(None),
                        Vocabulary.video_id.is_not(None),
                        Vocabulary.context_sentence.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        if not vocab_rows:
            print("[ok] no rows to backfill")
            return

        # Load each video's subtitles once; index exact + normalized text -> id.
        video_ids = {v.video_id for v in vocab_rows}
        exact: dict[tuple[str, str], str] = {}
        loose: dict[tuple[str, str], str] = {}
        for video_id in video_ids:
            subs = (await db.execute(select(Subtitle.id, Subtitle.text_en).where(Subtitle.video_id == video_id))).all()
            for sub_id, text_en in subs:
                exact[(video_id, text_en)] = sub_id
                loose.setdefault((video_id, _norm(text_en)), sub_id)

        matched = 0
        for vocab in vocab_rows:
            key = (vocab.video_id, vocab.context_sentence or "")
            sub_id = exact.get(key) or loose.get((key[0], _norm(key[1])))
            if sub_id is None:
                continue
            matched += 1
            if apply:
                vocab.subtitle_id = sub_id

        total = len(vocab_rows)
        mode = "APPLY" if apply else "DRY-RUN"
        print(f"[{mode}] candidate rows: {total}")
        print(f"[{mode}] matched:      {matched} ({matched * 100 // total}%)" if total else "")
        print(f"[{mode}] unmatched:    {total - matched} (left NULL — entry hidden in UI)")
        if apply:
            await db.commit()
            print("[ok] committed")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write matched subtitle_id (default: dry-run)")
    args = parser.parse_args()
    asyncio.run(backfill(apply=args.apply))


if __name__ == "__main__":
    main()

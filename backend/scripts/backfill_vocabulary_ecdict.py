#!/usr/bin/env python
"""Backfill ECDICT fields onto vocabulary rows that predate the enrichment.

Words are now enriched at 收词 time (``vocabulary_service.apply_ecdict_fields``
via the watch page and the vocab-set collect path). Rows created before that
change carry only the bare spelling: their cards show 「释义待补充」 and the
word-list 「级别」 column is empty.

This script fills the missing fields only — a non-null column is never
overwritten, because AI enrichment (``enrich_word``) may have written a richer
value and the user may have edited the word.

Usage:
    cd backend
    python scripts/backfill_vocabulary_ecdict.py            # dry-run, prints coverage
    python scripts/backfill_vocabulary_ecdict.py --apply    # write matched rows
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
from app.services import ecdict
from app.services.vocabulary_service import apply_ecdict_fields

# Fields this script may fill. Everything else stays untouched.
_FIELDS = ("translation", "definition", "part_of_speech", "ipa", "exam_level")


async def backfill(apply: bool) -> None:
    if not ecdict.is_available():
        print("[error] ECDICT database missing — run scripts/download_ecdict.py first")
        return

    async with async_session() as db:
        rows = (await db.execute(select(Vocabulary))).scalars().all()
        if not rows:
            print("[ok] no vocabulary rows")
            return

        missing_before = sum(1 for r in rows if any(getattr(r, f) is None for f in _FIELDS))
        touched = 0
        found = 0

        for vocab in rows:
            if not any(getattr(vocab, f) is None for f in _FIELDS):
                continue
            entry = ecdict.lookup(vocab.word)
            if not entry:
                continue
            found += 1
            # 只补空字段：把整条 ECDICT 映射套上去会覆盖已有（可能更准确的）
            # AI 释义与被用户改过的内容。
            enriched = Vocabulary(word=vocab.word)
            apply_ecdict_fields(enriched, entry)
            changed = False
            for field in _FIELDS:
                if getattr(vocab, field) is None:
                    value = getattr(enriched, field)
                    if value is not None:
                        setattr(vocab, field, value)
                        changed = True
            if changed:
                touched += 1

        if apply and touched:
            await db.commit()

    print(f"rows with missing fields : {missing_before}/{len(rows)}")
    print(f"matched in ECDICT       : {found}")
    print(f"{'updated' if apply else 'would update'}               : {touched}")
    if not apply:
        print("dry-run — re-run with --apply to write")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill ECDICT fields onto legacy vocabulary rows")
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry-run)")
    args = parser.parse_args()
    await backfill(args.apply)


if __name__ == "__main__":
    asyncio.run(main())

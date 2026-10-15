"""Normalize historical ``subtitles.word_levels`` rows to the canonical shape.

Why this exists
---------------
``word_levels`` maps a surface token to its exam level keys, and the column is
plain ``JSON``: nothing between a writer and the database enforced the shape.
Two shapes of one entry therefore exist — the canonical ``[level, ...]`` list
every current writer produces, and a bare ``str`` that consumers have tolerated
since the feature landed (``8db75a6``). That tolerance now lives in exactly one
place (``app.core.exam_levels.normalize_levels``) and
``app.models.types.WordLevelsJSON`` keeps new non-canonical values out, but rows
written before it are still in the old shape.

So the script reports the **census** — the count that decides whether
``normalize_levels``' ``str`` arm can still be deleted — and rewrites the rows
that are not canonical. It also repairs the third artifact of the untyped
column: a row written as an empty annotation set was stored as a JSON ``null``
*value*, not SQL NULL, because ``JSON`` defaults to ``none_as_null=False``. The
column type now binds ``None`` as SQL NULL; the rows already written that way
are converted here.

Reading raw values on purpose
-----------------------------
Reading ``Subtitle.word_levels`` through the ORM runs the column type's
``process_result_value``, which normalizes. An ORM read can therefore no longer
see the shape this script exists to find — and would not fix it either, since
the in-memory value already matches what the column would write, leaving
SQLAlchemy with no dirty attribute and no UPDATE to emit. The census reads
through a bare ``JSON`` column expression instead, and computes the count in
Python rather than with ``jsonb_each`` so that it runs on any dialect. The
equivalent psql query is:

    SELECT count(*) FROM subtitles
    WHERE word_levels IS NOT NULL
      AND jsonb_typeof(word_levels::jsonb) = 'object'
      AND EXISTS (
        SELECT 1 FROM jsonb_each(word_levels) AS e
        WHERE jsonb_typeof(e.value) <> 'array'
      );

Usage:
    cd backend
    python scripts/backfill_word_levels.py            # census only, never writes
    python scripts/backfill_word_levels.py --apply    # rewrite non-canonical rows

The last line of an ``--apply`` run is this batch's acceptance check: it must
report 0 rows with a non-array entry (exit 1 if not).
"""

import argparse
import asyncio
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import JSON, column, func, select, update

from app.core.database import async_session
from app.core.exam_levels import normalize_word_levels
from app.core.logging import get_logger
from app.models.subtitle import Subtitle

logger = get_logger(__name__)

# A bare ``JSON`` column expression, on purpose: this is the value as stored,
# before WordLevelsJSON's ``process_result_value`` would normalize it away.
_RAW_WORD_LEVELS = column("word_levels", JSON)


def summarize(rows: list[tuple[str, object]]) -> tuple[int, int, Counter[str]]:
    """(rows reviewed, rows with a non-array entry, entry counts by value type).

    A non-array entry is the legacy ``str`` shape this batch exists to find; a
    row that is not an object at all (a JSON ``null``, left by an empty
    annotation set) counts as one too. Pure on purpose — the census arithmetic
    is the part worth checking without a database behind it.
    """
    non_array = 0
    shapes: Counter[str] = Counter()
    for _sub_id, raw in rows:
        if not isinstance(raw, dict):
            shapes["null" if raw is None else type(raw).__name__] += 1
            non_array += 1
            continue
        for value in raw.values():
            shapes[type(value).__name__] += 1
        if any(not isinstance(value, list) for value in raw.values()):
            non_array += 1
    return len(rows), non_array, shapes


async def _annotated_rows(db) -> list[tuple[str, object]]:
    result = await db.execute(select(Subtitle.id, _RAW_WORD_LEVELS).where(Subtitle.word_levels.is_not(None)))
    return list(result.all())


async def main(apply: bool) -> int:
    async with async_session() as db:
        total = (await db.execute(select(func.count()).select_from(Subtitle))).scalar_one()
        rows = await _annotated_rows(db)
        reviewed, non_array, shapes = summarize(rows)
        logger.info("census: %d subtitles, %d annotated, %d with a non-array entry", total, reviewed, non_array)
        for value_type, entries in shapes.most_common():
            logger.info("census: entry value type %-9s -> %d", value_type, entries)

        changed = 0
        for sub_id, raw in rows:
            canonical = normalize_word_levels(raw)
            if canonical == raw:
                continue
            changed += 1
            logger.info("backfill: subtitle %s %r -> %r", sub_id, raw, canonical)
            # Through the column's own bind processing, so a rewrite writes
            # exactly what the application would — including SQL NULL for "no
            # annotations", which is what turns a legacy JSON null into NULL.
            await db.execute(update(Subtitle).where(Subtitle.id == sub_id).values(word_levels=canonical))

        if not apply:
            await db.rollback()
            logger.info("backfill: census only — %d rows would change, rolled back", changed)
            return 0

        await db.commit()
        logger.info("backfill: rewrote %d subtitles", changed)

        remaining = summarize(await _annotated_rows(db))[1]
        if remaining:
            logger.warning(
                "backfill: %d rows still carry a non-array entry — do not delete the str "
                "tolerance in app.core.exam_levels.normalize_levels until this is 0",
                remaining,
            )
            return 1
        logger.info("backfill: 0 rows with a non-array entry — normalize_levels' str arm is now removable")
        return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the canonical shape. Without it the script only reports the census.",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(apply=args.apply)))

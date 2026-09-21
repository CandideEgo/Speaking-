#!/usr/bin/env python
"""Backfill Video.difficulty_level for existing videos.

Computes CEFR difficulty (A1–C2) from subtitle word_levels for videos that
have a NULL difficulty_level. Videos with a manually-set level are skipped
unless ``--recompute`` is passed.

Usage:
    cd backend
    python scripts/backfill_difficulty.py                    # only NULL levels
    python scripts/backfill_difficulty.py --video-id <id>    # one video
    python scripts/backfill_difficulty.py --dry-run          # print without writing
    python scripts/backfill_difficulty.py --recompute        # overwrite every level

``--recompute`` re-runs the current algorithm over videos that already have a
level — needed after a calibration change (DEC-043). It cannot tell a computed
level from a hand-edited one, so it overwrites both; run with ``--dry-run``
first to see the before → after list.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from app.core.database import async_session
from app.models.subtitle import Subtitle
from app.models.video import Video, VideoStatus
from app.services.difficulty_service import beyond_basic_ratio, compute_difficulty_from_word_levels


async def compute_one(video_id: str, dry_run: bool, recompute: bool = False) -> str | None:
    """Compute difficulty for one video. Returns the CEFR level or None."""
    async with async_session() as db:
        video = await db.scalar(select(Video).where(Video.id == video_id))
        if not video:
            print(f"[error] video {video_id} not found", file=sys.stderr)
            return None

        previous = video.difficulty_level
        if previous and not recompute:
            print(f"[skip] {video_id} ({video.title[:40]}): already has level={previous}")
            return previous

        result = await db.execute(select(Subtitle.word_levels).where(Subtitle.video_id == video_id))
        word_levels_list = [row[0] for row in result.all()]

        ratio = beyond_basic_ratio(word_levels_list)
        cefr = compute_difficulty_from_word_levels(word_levels_list)
        if cefr is None:
            print(f"[skip] {video_id} ({video.title[:40]}): insufficient word data")
            return None

        was = f" (was {previous})" if previous else ""
        detail = f"{cefr}  超纲率={ratio:.3f}{was}"
        if dry_run:
            print(f"[dry-run] {video_id} ({video.title[:40]}): would set → {detail}")
        else:
            video.difficulty_level = cefr
            await db.commit()
            print(f"[done] {video_id} ({video.title[:40]}): → {detail}")
        return cefr


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", help="compute for a single video")
    parser.add_argument("--dry-run", action="store_true", help="print results without writing to DB")
    parser.add_argument(
        "--recompute",
        action="store_true",
        help="recompute even when a level is already set (overwrites hand-edited values too)",
    )
    args = parser.parse_args()

    if args.video_id:
        await compute_one(args.video_id, args.dry_run, args.recompute)
        return 0

    conditions = [Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles])]
    if not args.recompute:
        conditions.append(Video.difficulty_level.is_(None))

    async with async_session() as db:
        result = await db.execute(select(Video.id, Video.title).where(*conditions))
        videos = list(result.all())

    scope = "all" if args.recompute else "NULL difficulty_level"
    print(f"[run] {len(videos)} videos with {scope}")
    computed = 0
    skipped = 0
    for vid, _title in videos:
        level = await compute_one(vid, args.dry_run, args.recompute)
        if level:
            computed += 1
        else:
            skipped += 1

    print(f"\n[summary] computed={computed}, skipped={skipped}, total={len(videos)}")

    # difficulty_level feeds cached browse responses; writing it out-of-band
    # leaves the cache stale until its TTL expires.
    if not args.dry_run and computed:
        from app.services.video_cache import invalidate_browse_cache

        await invalidate_browse_cache()
        print("[cache] browse feed / featured / rankings invalidated")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

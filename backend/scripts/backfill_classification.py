#!/usr/bin/env python
"""Backfill LLM classification for existing videos.

Two jobs in one pass:

1. Classification — videos with NULL topic_tags get canonical topic tags
   (and difficulty when NULL) from the LLM classifier
   (services/video_classification.py).
2. Dirty-difficulty cleanup — difficulty_level values outside the A1–C2
   whitelist (e.g. the legacy "CR" rows) are nulled, then refilled in the
   fallback order used by finalize_video: LLM first, subtitle word-level
   computation as the fallback. Both halves run over the same status set
   (DIFFICULTY_BACKFILL_STATUSES); dirty values on videos still processing are
   reported and left for a later run.

Usage:
    cd backend
    python scripts/backfill_classification.py                 # all eligible videos
    python scripts/backfill_classification.py --video-id <id> # one video
    python scripts/backfill_classification.py --dry-run       # print without writing
    python scripts/backfill_classification.py --limit 20      # cap batch size
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from app.core.database import async_session
from app.models.video import Video
from app.services.difficulty_service import DIFFICULTY_BACKFILL_STATUSES, compute_video_difficulty
from app.services.video_classification import classify_video, classify_video_metadata

VALID_CEFR = {"A1", "A2", "B1", "B2", "C1", "C2"}


async def clean_dirty_difficulty(dry_run: bool) -> tuple[int, int]:
    """Null out difficulty_level values outside the A1–C2 whitelist.

    Returns ``(cleaned, deferred)``: ``deferred`` counts dirty values on videos
    still being processed, which are reported and left untouched rather than
    cleared — clearing them would leave the video without a level until a later
    run, while the invalid value is not shown anywhere until the video is ready.
    """
    async with async_session() as db:
        result = await db.execute(
            select(Video).where(
                Video.difficulty_level.isnot(None),
                Video.status.in_(DIFFICULTY_BACKFILL_STATUSES),
            )
        )
        dirty = [v for v in result.scalars().all() if v.difficulty_level not in VALID_CEFR]
        for v in dirty:
            print(f"[clean] {v.id} ({v.title[:40]}): invalid difficulty {v.difficulty_level!r} → NULL")
            if not dry_run:
                v.difficulty_level = None
        if dirty and not dry_run:
            await db.commit()

        deferred_result = await db.execute(
            select(Video).where(
                Video.difficulty_level.isnot(None),
                Video.status.notin_(DIFFICULTY_BACKFILL_STATUSES),
            )
        )
        deferred = [v for v in deferred_result.scalars().all() if v.difficulty_level not in VALID_CEFR]
        for v in deferred:
            print(f"[defer] {v.id} ({v.title[:40]}): invalid difficulty {v.difficulty_level!r} (status={v.status})")
    return len(dirty), len(deferred)


async def classify_one(video_id: str, dry_run: bool) -> str:
    """Classify a single video. Returns "done" | "skip" | "fail"."""
    async with async_session() as db:
        video = await db.scalar(select(Video).where(Video.id == video_id))
        if not video:
            print(f"[error] video {video_id} not found", file=sys.stderr)
            return "fail"
        if video.topic_tags:
            print(f"[skip] {video_id} ({video.title[:40]}): already has topic_tags={video.topic_tags!r}")
            return "skip"
        if dry_run:
            try:
                result = await classify_video(db, video)
            except Exception as exc:
                print(f"[fail] {video_id} ({video.title[:40]}): {exc}")
                return "fail"
            print(
                f"[dry-run] {video_id} ({video.title[:40]}): "
                f"would set topic_tags={result['topics']} difficulty={result['difficulty']}"
            )
            return "done"
        try:
            written = await classify_video_metadata(db, video_id)
        except Exception as exc:
            print(f"[fail] {video_id} ({video.title[:40]}): {exc}")
            return "fail"
        if not written:
            print(f"[skip] {video_id} ({video.title[:40]}): already has topic_tags")
            return "skip"
        # Re-read for the log line (classify_video_metadata committed).
        video = await db.scalar(select(Video).where(Video.id == video_id))
        print(
            f"[done] {video_id} ({video.title[:40]}): "
            f"topic_tags={video.topic_tags!r} difficulty={video.difficulty_level!r}"
        )
        return "done"


async def fill_missing_difficulty(dry_run: bool) -> int:
    """Subtitle word-level fallback for videos still lacking a difficulty."""
    async with async_session() as db:
        result = await db.execute(
            select(Video.id).where(
                Video.status.in_(DIFFICULTY_BACKFILL_STATUSES),
                Video.difficulty_level.is_(None),
            )
        )
        ids = list(result.scalars().all())
    filled = 0
    for vid in ids:
        if dry_run:
            print(f"[dry-run] {vid}: would compute difficulty from subtitles")
            filled += 1
            continue
        async with async_session() as db:
            level = await compute_video_difficulty(db, vid)
        if level:
            print(f"[done] {vid}: difficulty → {level} (subtitle fallback)")
            filled += 1
    return filled


async def _invalidate_browse_cache() -> None:
    """Drop cached browse responses after an out-of-band write.

    topic_tags / difficulty_level both feed cached browse responses; writing
    them from a script leaves the cache stale until its TTL expires. Shared by
    the batch path and ``--video-id`` so a single-video run cannot silently
    skip invalidation.
    """
    from app.services.video_cache import invalidate_browse_cache

    await invalidate_browse_cache()
    print("[cache] browse feed / featured / rankings invalidated")


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", help="classify a single video")
    parser.add_argument("--dry-run", action="store_true", help="print results without writing to DB")
    parser.add_argument("--limit", type=int, default=0, help="cap the number of videos classified")
    args = parser.parse_args()

    if args.video_id:
        outcome = await classify_one(args.video_id, args.dry_run)
        if outcome == "done" and not args.dry_run:
            await _invalidate_browse_cache()
        return 0

    cleaned, deferred = await clean_dirty_difficulty(args.dry_run)
    print(f"[run] cleaned {cleaned} dirty difficulty values, deferred {deferred} on non-ready videos")

    async with async_session() as db:
        query = select(Video.id).where(
            Video.status.in_(DIFFICULTY_BACKFILL_STATUSES),
            Video.topic_tags.is_(None),
        )
        if args.limit:
            query = query.limit(args.limit)
        result = await db.execute(query)
        ids = list(result.scalars().all())

    print(f"[run] {len(ids)} videos with NULL topic_tags")
    done = 0
    skipped = 0
    failed = 0
    for vid in ids:
        outcome = await classify_one(vid, args.dry_run)
        if outcome == "done":
            done += 1
        elif outcome == "skip":
            skipped += 1
        else:
            failed += 1

    filled = await fill_missing_difficulty(args.dry_run)
    print(
        f"\n[summary] classified={done}, skipped={skipped}, failed={failed}, "
        f"difficulty_filled={filled}, total={len(ids)}"
    )

    # topic_tags and difficulty_level both feed cached browse responses; writing
    # them out-of-band leaves the cache stale until its TTL expires.
    if not args.dry_run and (done or cleaned or filled):
        await _invalidate_browse_cache()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

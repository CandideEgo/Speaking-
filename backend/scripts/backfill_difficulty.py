#!/usr/bin/env python
"""Backfill Video.difficulty_level for existing videos.

Computes CEFR difficulty (A1–C2) from subtitle word_levels for videos that
have a NULL difficulty_level. Videos with a manually-set level are skipped.

Usage:
    cd backend
    python scripts/backfill_difficulty.py                 # all eligible videos
    python scripts/backfill_difficulty.py --video-id <id> # one video
    python scripts/backfill_difficulty.py --dry-run       # print without writing
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
from app.services.difficulty_service import compute_difficulty_from_word_levels


async def compute_one(video_id: str, dry_run: bool) -> str | None:
    """Compute difficulty for one video. Returns the CEFR level or None."""
    async with async_session() as db:
        video = await db.scalar(select(Video).where(Video.id == video_id))
        if not video:
            print(f"[error] video {video_id} not found", file=sys.stderr)
            return None

        if video.difficulty_level:
            print(f"[skip] {video_id} ({video.title[:40]}): already has level={video.difficulty_level}")
            return video.difficulty_level

        result = await db.execute(select(Subtitle.word_levels).where(Subtitle.video_id == video_id))
        word_levels_list = [row[0] for row in result.all()]

        cefr = compute_difficulty_from_word_levels(word_levels_list)
        if cefr is None:
            print(f"[skip] {video_id} ({video.title[:40]}): insufficient word data")
            return None

        if dry_run:
            print(f"[dry-run] {video_id} ({video.title[:40]}): would set → {cefr}")
        else:
            video.difficulty_level = cefr
            await db.commit()
            print(f"[done] {video_id} ({video.title[:40]}): → {cefr}")
        return cefr


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", help="compute for a single video")
    parser.add_argument("--dry-run", action="store_true", help="print results without writing to DB")
    args = parser.parse_args()

    if args.video_id:
        await compute_one(args.video_id, args.dry_run)
        return 0

    async with async_session() as db:
        result = await db.execute(
            select(Video.id, Video.title).where(
                Video.status.in_([VideoStatus.ready, VideoStatus.ready_subtitles]),
                Video.difficulty_level.is_(None),
            )
        )
        videos = list(result.all())

    print(f"[run] {len(videos)} videos with NULL difficulty_level")
    computed = 0
    skipped = 0
    for vid, _title in videos:
        level = await compute_one(vid, args.dry_run)
        if level:
            computed += 1
        else:
            skipped += 1

    print(f"\n[summary] computed={computed}, skipped={skipped}, total={len(videos)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

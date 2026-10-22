#!/usr/bin/env python
"""Backfill ``videos.title_zh`` for existing videos.

The pipeline translates a title once, in the translating step. Videos that were
already ready before ``title_zh`` existed need a one-off pass. This script uses
the same TranslationService (primary + optional fallback engine) and writes
only rows whose ``title_zh`` is still NULL, so it is safe to re-run.

Usage:
    cd backend
    python scripts/backfill_video_titles_zh.py                  # all missing
    python scripts/backfill_video_titles_zh.py --video-id <id>  # one video
    python scripts/backfill_video_titles_zh.py --dry-run        # print only
    python scripts/backfill_video_titles_zh.py --limit 20       # cap batch
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
from app.services.video_title import normalize_title_zh


async def _translate_titles(titles: list[str], engine: str | None = None) -> list[str | None]:
    from app.services.translation import TranslationService, get_translation_service

    if not titles:
        return []
    service = TranslationService(engine_override=engine) if engine else get_translation_service()
    return await service.translate_batch(titles)


async def backfill_one(video_id: str, dry_run: bool) -> bool:
    async with async_session() as db:
        video = await db.scalar(select(Video).where(Video.id == video_id))
        if video is None:
            print(f"[error] video {video_id} not found", file=sys.stderr)
            return False
        if video.title_zh:
            print(f"[skip] {video_id} ({video.title[:40]}): already has title_zh={video.title_zh!r}")
            return False
        translated = normalize_title_zh((await _translate_titles([video.title]))[0])
        if not translated:
            print(f"[fail] {video_id} ({video.title[:40]}): translation returned nothing")
            return False
        if dry_run:
            print(f"[dry-run] {video_id} ({video.title[:40]}): would set title_zh={translated!r}")
            return True
        video.title_zh = translated
        await db.commit()
        print(f"[done] {video_id} ({video.title[:40]}): title_zh={translated!r}")
        return True


async def backfill_all(dry_run: bool, limit: int) -> tuple[int, int, int]:
    async with async_session() as db:
        query = select(Video).where(Video.title_zh.is_(None)).order_by(Video.created_at.asc(), Video.id.asc())
        if limit:
            query = query.limit(limit)
        videos = list((await db.execute(query)).scalars().all())

    print(f"[run] {len(videos)} videos with NULL title_zh")
    done = skipped = failed = 0
    # The service batches internally; 20 rows keeps each commit small while
    # still amortising one LLM round-trip across several titles.
    chunk_size = 20
    for start in range(0, len(videos), chunk_size):
        chunk = videos[start : start + chunk_size]
        results = await _translate_titles([video.title for video in chunk])
        async with async_session() as db:
            for video, result in zip(chunk, results, strict=True):
                translated = normalize_title_zh(result)
                if not translated:
                    failed += 1
                    print(f"[fail] {video.id} ({video.title[:40]}): translation returned nothing")
                    continue
                if dry_run:
                    done += 1
                    print(f"[dry-run] {video.id} ({video.title[:40]}): would set title_zh={translated!r}")
                    continue
                row = await db.get(Video, video.id)
                if row is None or row.title_zh:
                    skipped += 1
                    continue
                row.title_zh = translated
                done += 1
                print(f"[done] {video.id} ({video.title[:40]}): title_zh={translated!r}")
            if not dry_run and done:
                await db.commit()
    return done, skipped, failed


async def _invalidate_browse_cache() -> None:
    from app.services.video_cache import invalidate_browse_cache

    await invalidate_browse_cache()
    print("[cache] browse feed / featured / rankings invalidated")


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", help="backfill a single video")
    parser.add_argument("--dry-run", action="store_true", help="print results without writing to DB")
    parser.add_argument("--limit", type=int, default=0, help="cap the number of videos")
    args = parser.parse_args()

    if args.video_id:
        written = await backfill_one(args.video_id, args.dry_run)
        if written and not args.dry_run:
            await _invalidate_browse_cache()
        return 0

    done, skipped, failed = await backfill_all(args.dry_run, args.limit)
    print(f"\n[summary] written={done}, skipped={skipped}, failed={failed}")
    if not args.dry_run and done:
        await _invalidate_browse_cache()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

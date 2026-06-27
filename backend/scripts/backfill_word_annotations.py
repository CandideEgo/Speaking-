#!/usr/bin/env python
"""Backfill Subtitle.word_levels for existing videos.

The ``annotating`` pipeline step (see app/tasks/video_processing.py) populates
``Subtitle.word_levels`` from ECDICT for newly ingested videos. This script
re-runs the same annotation for videos that were ingested before the step
existed, or whose annotations need refreshing.

Requires the ECDICT database — run ``python scripts/download_ecdict.py`` first.

Usage:
    cd backend
    python scripts/backfill_word_annotations.py                 # all ready videos
    python scripts/backfill_word_annotations.py --video-id <id> # one video
    python scripts/backfill_word_annotations.py --force          # re-annotate even if present
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
from app.services import ecdict


async def annotate_video(video_id: str, force: bool) -> tuple[int, int]:
    """Annotate one video's subtitles. Returns (subtitles_updated, exam_words_found)."""
    async with async_session() as db:
        result = await db.execute(select(Video).where(Video.id == video_id))
        video = result.scalar_one_or_none()
        if not video:
            print(f"[error] video {video_id} not found", file=sys.stderr)
            return (0, 0)

        sub_result = await db.execute(
            select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index)
        )
        subs = list(sub_result.scalars().all())
        if not subs:
            print(f"[skip] video {video_id} has no subtitles")
            return (0, 0)

        updated = 0
        total_words = 0
        for s in subs:
            if s.word_levels and not force:
                continue
            levels = ecdict.annotate_text(s.text_en)
            s.word_levels = levels or None
            if levels:
                updated += 1
                total_words += len(levels)
        await db.commit()
        return (updated, total_words)


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", help="annotate a single video")
    parser.add_argument("--force", action="store_true", help="re-annotate even if word_levels present")
    args = parser.parse_args()

    if not ecdict.is_available():
        print(
            f"[error] ECDICT db not found at {ecdict.DB_PATH}. Run: python scripts/download_ecdict.py",
            file=sys.stderr,
        )
        return 1

    # Build the index once and report tag coverage for verification.
    ecdict.get_index()
    coverage = ecdict.verify_tag_coverage()
    print(f"[ecdict] mapped tags: {coverage['mapped']}")
    if coverage["unmapped"]:
        print(f"[ecdict] unmapped tags (ignored): {coverage['unmapped']}")
    if coverage["missing_levels"]:
        print(f"[ecdict] WARNING — level keys with no matching tag: {coverage['missing_levels']}")

    if args.video_id:
        updated, words = await annotate_video(args.video_id, args.force)
        print(f"[done] {args.video_id}: {updated} subtitles annotated, {words} exam-word entries")
        return 0

    async with async_session() as db:
        result = await db.execute(select(Video.id, Video.title).where(Video.status == VideoStatus.ready))
        videos = list(result.all())

    print(f"[run] {len(videos)} ready videos to annotate")
    total_updated = 0
    for vid, title in videos:
        updated, words = await annotate_video(vid, args.force)
        total_updated += updated
        print(f"  {vid} ({title}): {updated} subtitles, {words} exam words")
    print(f"[done] annotated {total_updated} subtitles across {len(videos)} videos")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

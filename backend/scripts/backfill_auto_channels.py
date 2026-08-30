"""Backfill auto-channels for existing videos (ADR-0014 rev. 2026-08-30).

Full author pages: ingest now auto-creates a channel for every scraped
upstream channel id. This script retro-fits videos ingested before that -
for each ``channel_id``-bearing video without a ``channel_ref``, find-or-create
the author's channel (``ensure_channel_for``) and attach it. Curated
assignments registered by admins win: videos already attached are skipped,
and a channel registered for the upstream id is reused instead of creating
a duplicate.

Usage:
    cd backend
    python scripts/backfill_auto_channels.py [--dry-run]
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from app.core.database import async_session
from app.core.logging import get_logger
from app.models.channel import Channel
from app.models.video import Video
from app.services.channel_service import ensure_channel_for, invalidate_channel_caches

logger = get_logger(__name__)


async def main(dry_run: bool) -> None:
    async with async_session() as db:
        known_upstreams = set(
            (await db.execute(select(Channel.upstream_channel_id).where(Channel.upstream_channel_id.is_not(None))))
            .scalars()
            .all()
        )
        videos = list(
            (await db.execute(select(Video).where(Video.channel_ref.is_(None), Video.channel_id.is_not(None))))
            .scalars()
            .all()
        )
        if not videos:
            logger.info("backfill: nothing to do (no unattached videos with a scraped channel_id)")
            return

        attached = 0
        created = 0
        for video in videos:
            if video.channel_id not in known_upstreams:
                created += 1
                known_upstreams.add(video.channel_id)
            channel = await ensure_channel_for(db, video.channel_id, video.channel_name)
            video.channel_ref = channel.id
            attached += 1
            logger.info("backfill: video %s -> channel %s (%s)", video.id, channel.slug, channel.name)

        if dry_run:
            await db.rollback()
            logger.info(
                "backfill: dry-run, rolled back (would attach %d videos, create %d channels)", attached, created
            )
            return

        await db.commit()
        try:
            await invalidate_channel_caches([v.id for v in videos])
        except Exception:
            logger.warning("backfill: cache invalidation failed", exc_info=True)
        logger.info("backfill: attached %d videos, created %d channels", attached, created)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Roll back instead of committing")
    args = parser.parse_args()
    asyncio.run(main(dry_run=args.dry_run))

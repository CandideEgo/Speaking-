#!/usr/bin/env python
"""One-click recovery for a stuck video processing pipeline.

When a Celery worker dies mid-``finalize_video`` (the most common cause: the
cloud worker that owns the ``celery`` queue was killed), the video is left with
``status = processing`` (or ``ready_subtitles``) and a stale
``video:processing:{id}`` Redis lock that makes ``finalize_video`` refuse to
re-run ("already being processed, skipping"). This script clears that lock,
re-dispatches ``finalize_video`` (which is resume-safe — each step checks
``_is_step_done()`` and skips completed work), then polls the DB until the
video reaches a terminal status (``ready`` / ``error``) or a timeout fires.

Usage:
    cd backend
    python scripts/recover_video.py <video_id>
    python scripts/recover_video.py <video_id> --timeout 600
    python scripts/recover_video.py --last          # recover the most recent stuck video
    python scripts/recover_video.py <video_id> --dry-run   # show plan, dispatch nothing
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

STUCK_STATUSES = {"processing", "ready_subtitles"}
TERMINAL_STATUSES = {"ready", "error"}
POLL_INTERVAL = 5.0  # seconds


async def _load_video(db, video_id: str | None, last: bool):
    from sqlalchemy import select

    from app.models.video import Video

    if video_id:
        row = await db.execute(select(Video).where(Video.id == video_id))
        return row.scalar_one_or_none()
    if last:
        row = await db.execute(
            select(Video).where(Video.status.in_(STUCK_STATUSES)).order_by(Video.created_at.desc()).limit(1)
        )
        return row.scalar_one_or_none()
    return None


async def _status_tuple(db, video_id: str):
    from sqlalchemy import select

    from app.models.video import Video

    row = await db.execute(
        select(Video.status, Video.processing_step, Video.processing_progress, Video.error_message).where(
            Video.id == video_id
        )
    )
    return row.one_or_none()


async def recover(video_id: str | None, *, last: bool, timeout: float, dry_run: bool) -> int:
    from app.core.config import get_settings
    from app.core.database import async_session

    settings = get_settings()

    async with async_session() as db:
        video = await _load_video(db, video_id, last)
        if not video:
            target = video_id or "most recent stuck video"
            print(f"[error] video not found: {target}", file=sys.stderr)
            print(f"        (stuck statuses = {sorted(STUCK_STATUSES)})", file=sys.stderr)
            return 2
        vid = str(video.id)
        print(f"[video] {vid}")
        print(f"  title:   {video.title}")
        print(f"  status:  {video.status}  step={video.processing_step}  progress={video.processing_progress}")
        if video.error_message:
            print(f"  error:   {video.error_message}")

    # Already done?
    if video.status in TERMINAL_STATUSES:
        print(f"[done] video already in terminal status: {video.status}")
        return 0

    if dry_run:
        print("[dry-run] would: clear video:processing lock + re-dispatch finalize_video")
        return 0

    # 1. Clear the stale processing lock so finalize_video won't skip.
    import redis as redis_lib

    r = redis_lib.from_url(settings.redis_url, decode_responses=True)
    lock_key = f"video:processing:{vid}"
    cleared = r.delete(lock_key)
    print(f"[lock] cleared stale {lock_key}" if cleared else f"[lock] no stale lock present ({lock_key})")

    # 2. Re-dispatch finalize_video (resume-safe: skips done steps).
    from app.tasks.video_processing import finalize_video

    result = finalize_video.delay(vid)
    print(f"[dispatch] finalize_video task_id={result.id}")

    # 3. Poll DB until terminal status or timeout.
    print(f"[monitor] polling every {POLL_INTERVAL:.0f}s (timeout {timeout:.0f}s)...")
    t0 = time.monotonic()
    last_step = None
    while True:
        await asyncio.sleep(POLL_INTERVAL)
        async with async_session() as db:
            row = await _status_tuple(db, vid)
        if not row:
            print("[error] video vanished during monitoring", file=sys.stderr)
            return 3
        status, step, progress, err = row
        if step != last_step:
            print(f"  -> step={step}  progress={progress}%  status={status}")
            last_step = step
        elif progress is not None:
            print(f"  -> step={step}  progress={progress}%  status={status}")
        if status in TERMINAL_STATUSES:
            print(f"[result] status={status}" + (f"  error={err}" if err else ""))
            return 0 if status == "ready" else 1
        if time.monotonic() - t0 > timeout:
            print(f"[timeout] still {status}/{step} after {timeout:.0f}s — worker may be down", file=sys.stderr)
            return 4


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("video_id", nargs="?", help="video id to recover (omit with --last)")
    parser.add_argument("--last", action="store_true", help="recover the most recent stuck video")
    parser.add_argument("--timeout", type=float, default=1800.0, help="monitor timeout in seconds (default 1800)")
    parser.add_argument("--dry-run", action="store_true", help="show plan without dispatching")
    args = parser.parse_args()

    if not args.video_id and not args.last:
        parser.error("provide a video_id, or use --last")
    return asyncio.run(recover(args.video_id, last=args.last, timeout=args.timeout, dry_run=args.dry_run))


if __name__ == "__main__":
    raise SystemExit(main())

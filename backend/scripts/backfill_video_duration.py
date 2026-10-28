#!/usr/bin/env python
"""Re-probe local media durations and report DB drift (BUG-19).

``videos.duration`` is written by ingest and is the denominator for watch
progress (``progress_percentage = position_seconds / videos.duration`` in
``api/v1/learning.py``). When the stored value drifts from the real media
length the progress bar reads e.g. "已看 100%" while minutes remain, so the
fix belongs on the data side rather than in the UI.

This script lists media files on the local volume, maps each back to its video
id, re-runs ffprobe (``app.core.media_probe.get_video_duration``), and reports the
DB-vs-media difference. Values beyond ``--tolerance`` seconds are reported;
with ``--apply`` they are written back.

**dry-run is the default.** Pass ``--apply`` explicitly to write.

Usage:
    cd backend
    python scripts/backfill_video_duration.py                  # report only
    python scripts/backfill_video_duration.py --limit 20
    python scripts/backfill_video_duration.py --video-id <id>
    python scripts/backfill_video_duration.py --apply          # write back
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import async_session
from app.core.media_probe import get_video_duration
from app.models.video import Video

# 交付给前端的变体优先；``{id}_raw.*`` 是转码前的源文件，同一条视频只取一个。
VARIANT_SUFFIXES = ("_720p", "_1080p", "_480p", "")


def _media_dir() -> Path:
    return Path(get_settings().local_media_path).resolve()


def _video_id_of(stem: str) -> str | None:
    """从媒体文件名反推 video_id；``_raw`` 与未知后缀返回 None。"""
    if stem.endswith("_raw"):
        return None
    for suffix in VARIANT_SUFFIXES:
        if suffix and stem.endswith(suffix):
            return stem[: -len(suffix)]
    return stem


def _collect_media_files(media_dir: Path) -> dict[str, Path]:
    """扫描媒体卷，返回 ``video_id -> 本地文件``（每个 id 取优先级最高的变体）。"""
    # lower rank wins: _720p > _1080p > _480p > bare
    best: dict[str, tuple[int, Path]] = {}
    for f in media_dir.iterdir():
        if not f.is_file() or f.suffix.lower() not in {".mp4", ".mkv", ".webm", ".mov"}:
            continue
        video_id = _video_id_of(f.stem)
        if not video_id:
            continue
        rank = next(
            (i for i, s in enumerate(VARIANT_SUFFIXES) if s and f.stem.endswith(s)),
            len(VARIANT_SUFFIXES),
        )
        if video_id not in best or rank < best[video_id][0]:
            best[video_id] = (rank, f)
    return {video_id: path for video_id, (_, path) in best.items()}


async def _load_rows(video_ids: list[str]) -> dict[str, tuple[str, float | None]]:
    """批量取回 ``id -> (title, duration)``；媒体卷里的孤儿文件不在结果中。"""
    if not video_ids:
        return {}
    async with async_session() as db:
        result = await db.execute(select(Video.id, Video.title, Video.duration).where(Video.id.in_(video_ids)))
        return {row.id: (row.title, row.duration) for row in result.all()}


async def _apply(video_id: str, duration: float) -> None:
    async with async_session() as db:
        video = await db.scalar(select(Video).where(Video.id == video_id))
        if video is None:
            return
        video.duration = duration
        await db.commit()


async def _run(args: argparse.Namespace) -> int:
    media_dir = _media_dir()
    if not media_dir.exists():
        print(f"[error] media dir not found: {media_dir}", file=sys.stderr)
        return 1

    media = _collect_media_files(media_dir)
    if args.video_id:
        media = {args.video_id: media[args.video_id]} if args.video_id in media else {}
        if not media:
            print(f"[error] no local media file for video {args.video_id}", file=sys.stderr)
            return 1

    ids = list(media)
    if args.limit:
        ids = ids[: args.limit]

    rows = await _load_rows(ids)

    checked = drifted = written = 0
    for video_id in ids:
        path = media[video_id]
        if video_id not in rows:
            print(f"[orphan] {video_id}: media {path.name} has no Video row")
            continue
        title, db_duration = rows[video_id]
        checked += 1

        real = get_video_duration(str(path))
        if real <= 0:
            print(f"[error] {video_id} ({title[:40]}): ffprobe returned no duration")
            continue

        delta = None if db_duration is None else real - db_duration
        if delta is not None and abs(delta) <= args.tolerance:
            print(f"[ok] {video_id} ({title[:40]}): db={db_duration:.2f} media={real:.2f}")
            continue

        drifted += 1
        shown_db = "NULL" if db_duration is None else f"{db_duration:.2f}"
        shown_delta = "n/a" if delta is None else f"{delta:+.2f}"
        print(f"[drift] {video_id} ({title[:40]}): db={shown_db} media={real:.2f} delta={shown_delta}")
        if args.apply:
            await _apply(video_id, real)
            written += 1
            print(f"[done] {video_id}: duration → {real:.2f}")
        else:
            print(f"[dry-run] {video_id}: would set duration → {real:.2f}")

    mode = "apply" if args.apply else "dry-run"
    print(f"\n[summary] mode={mode} checked={checked} drifted={drifted} written={written} scanned={len(media)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", help="check a single video")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="report only (default; kept for symmetry with sibling scripts)",
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="write corrected durations back to the DB (default: report only)",
    )
    parser.add_argument("--limit", type=int, default=0, help="cap the number of videos checked")
    parser.add_argument(
        "--tolerance",
        type=float,
        default=1.0,
        help="seconds of allowed DB-vs-media difference (default: 1.0)",
    )
    return asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())

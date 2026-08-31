"""Backfill: download external thumbnails into the local media volume.

任务 3 一次性运维脚本 —— 让封面彻底摆脱对 /media/proxy 出口（HK 中转 /
HTTP_PROXY）的运行时依赖。遍历 thumbnail_url 仍为外部 URL 的 videos，用
``services.thumbnail_service`` 下载为 ``media/{video_id}_thumb{ext}`` 并把 DB
改写为本地路径。幂等、可重跑；失败清单落盘 tmp/thumbnail_failures.txt。

网络要求：执行机能直连 ytimg/hdslb 等 CDN（或经 --proxy 指定的出口）时下载原封面；
直连不通但本地已有视频文件（{id}_720p/_raw）时，自动用 ffmpeg 抽帧生成封面。
服务器两者都不满足时：在有外网的机器上跑本脚本 → rsync 媒体目录回服务器 →
服务器上再跑一次 ``--update-db-only``（只按已存在的本地文件改写 DB）。

Usage:
    cd backend
    python scripts/backfill_local_thumbnails.py [--dry-run] [--limit N]
        [--sleep 0.5] [--proxy URL] [--update-db-only]
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
from app.services.thumbnail_service import (
    local_thumbnail_stems,
    localize_video_thumbnail,
)


def _youtube_fallbacks(video) -> list[str]:
    """Build YouTube thumbnail fallback URLs from the video's source URL."""
    src = video.source_url or ""
    yt_id = video.yt_video_id
    if not yt_id and "youtube.com/watch" in src:
        # Extract video id from URL
        for part in src.split("v=")[-1:]:
            yt_id = part.split("&")[0]
            break
    if not yt_id:
        return []
    return [f"https://i.ytimg.com/vi/{yt_id}/{q}.jpg" for q in ("maxresdefault", "hqdefault", "sddefault", "default")]


_FAILURES_PATH = Path(__file__).resolve().parent.parent / "tmp" / "thumbnail_failures.txt"


async def _candidates(limit: int | None) -> list[tuple[str, str | None, str]]:
    async with async_session() as db:
        stmt = select(Video.id, Video.title, Video.thumbnail_url).where(Video.thumbnail_url.like("http%"))
        if limit:
            stmt = stmt.limit(limit)
        return list((await db.execute(stmt)).all())


async def run(args: argparse.Namespace) -> int:
    rows = await _candidates(args.limit)
    print(f"[thumbs] {len(rows)} videos with external thumbnail_url")
    if not rows:
        return 0

    if args.dry_run:
        for vid, title, url in rows:
            print(f"  - {vid[:8]} {(title or '')[:45]} | {url[:80]}")
        return 0

    ok = skipped = failed = 0
    failures: list[str] = []

    async with async_session() as db:
        for vid, title, url in rows:
            video = await db.get(Video, vid)
            if video is None or not (video.thumbnail_url or "").startswith("http"):
                skipped += 1
                continue

            existing = local_thumbnail_stems(vid)
            if existing:
                # File already local (e.g. rsynced back from another box) —
                # just fix the DB row.
                video.thumbnail_url = f"/media/{existing[0].name}"
                await db.commit()
                skipped += 1
                print(f"  [LOCAL] {vid[:8]} {(title or '')[:45]} -> {existing[0].name}")
                continue

            if args.update_db_only:
                failures.append(f"{vid}\t{url}\tfile missing")
                failed += 1
                continue

            # localize 内部完成下载→探测扩展名→改名→改 DB；CDN 不可达时自动
            # 用本地视频文件抽帧兜底（出口断掉也能产出封面）。
            fallbacks = _youtube_fallbacks(video)
            if await localize_video_thumbnail(video, proxy=args.proxy, fallback_urls=fallbacks):
                await db.commit()
                ok += 1
                print(f"  [OK] {vid[:8]} {(title or '')[:45]} -> {video.thumbnail_url}")
            else:
                failures.append(f"{vid}\t{url}\tdownload failed")
                failed += 1
                print(f"  [FAIL] {vid[:8]} {(title or '')[:45]} | {url[:70]}")
            await asyncio.sleep(args.sleep)

    _FAILURES_PATH.parent.mkdir(parents=True, exist_ok=True)
    _FAILURES_PATH.write_text("\n".join(failures) + ("\n" if failures else ""), encoding="utf-8")
    print(f"[thumbs] done: {ok} localized, {skipped} skipped, {failed} failed")
    if failures:
        print(f"[thumbs] failures written to {_FAILURES_PATH}")
    return 0 if failed == 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="Backfill local thumbnails for videos with external URLs")
    ap.add_argument("--dry-run", action="store_true", help="list candidates without writing")
    ap.add_argument("--limit", type=int, default=None, help="process at most N videos")
    ap.add_argument("--sleep", type=float, default=0.5, help="seconds between downloads")
    ap.add_argument("--proxy", type=str, default=None, help="egress proxy URL (overrides HTTP_PROXY)")
    ap.add_argument(
        "--update-db-only",
        action="store_true",
        help="only rewrite DB rows whose local file already exists (post-rsync pass)",
    )
    args = ap.parse_args()
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())

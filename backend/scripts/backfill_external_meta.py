"""Backfill external (YouTube) metadata + speech metrics for existing videos.

阶段 1 + 阶段 3 of the video feature plan, for videos processed before the
columns existed:

Pass 1 (external): for ``video_source=imported`` videos whose ``external_meta``
is NULL, re-run ``yt-dlp extract_info(download=False)`` and write the parsed
fields (channel/upload_date/ext_view_count/… + external_meta blob). Network
bound; throttled with --sleep.

Pass 2 (speech): for videos with subtitles whose ``wpm`` is NULL, compute
WPM/vocabulary-density locally from subtitle rows (no network).

Usage:
    cd backend
    python scripts/backfill_external_meta.py [--dry-run] [--skip-external]
        [--skip-speech] [--sleep 1.0]
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import async_session
from app.core.logging import get_logger
from app.models.subtitle import Subtitle
from app.models.video import Video, VideoSource
from app.services.external_meta import apply_external_meta, parse_external_meta
from app.services.subtitle_metrics_service import compute_video_speech_metrics

logger = get_logger(__name__)


async def _extract(url: str, cookies_path: str | None) -> dict | None:
    """yt-dlp extract_info (download=False) with the app's proxy config."""
    import yt_dlp

    settings = get_settings()
    loop = asyncio.get_event_loop()

    def _sync():
        opts = {"quiet": True, "no_warnings": True, "skip_download": True}
        if settings.http_proxy:
            opts["proxy"] = settings.http_proxy
        if cookies_path:
            opts["cookiefile"] = cookies_path
        opts["socket_timeout"] = 30
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)

    try:
        return await loop.run_in_executor(None, _sync)
    except Exception as e:
        logger.warning("backfill: extract_info failed for %s: %s", url, str(e)[:200])
        return None


async def _fetch_info(url: str) -> dict | None:
    """Extract with current cookies; on failure reuse the pipeline's
    probe + refresh flow (``ensure_cookies_for_pipeline``) and retry once."""
    settings = get_settings()
    info = await _extract(url, settings.youtube_cookies_path or None)
    if info is not None:
        return info

    from app.services.youtube_cookies_service import ensure_cookies_for_pipeline

    result = await ensure_cookies_for_pipeline(url)
    # Refresh may rewrite the same file in place — retry once regardless.
    info = await _extract(url, result.cookies_path or settings.youtube_cookies_path)
    if info is None:
        logger.warning("backfill: cookies refresh didn't help (%s) for %s", result.status, url)
    return info


async def pass_external(dry_run: bool, sleep_s: float) -> tuple[int, int, int]:
    """Returns (candidates, ok, failed)."""
    async with async_session() as db:
        result = await db.execute(
            select(Video.id, Video.title, Video.source_url).where(
                Video.video_source == VideoSource.imported,
                Video.external_meta.is_(None),
            )
        )
        rows = result.all()

    print(f"[external] {len(rows)} imported videos without external_meta")
    if dry_run:
        for vid, title, url in rows:
            print(f"  - {vid[:8]} {(title or '')[:50]} | {url}")
        return len(rows), 0, 0

    ok = failed = 0
    for vid, title, url in rows:
        info = await _fetch_info(url)
        if info is None:
            failed += 1
            print(f"  [FAIL] {vid[:8]} {(title or '')[:50]}")
            await asyncio.sleep(sleep_s)
            continue
        parsed = parse_external_meta(info)
        async with async_session() as db:
            video = await db.scalar(select(Video).where(Video.id == vid))
            if video is not None and video.external_meta is None:
                apply_external_meta(video, parsed)
                # Title may still be the "Processing..." placeholder.
                if info.get("title") and (not video.title or video.title == "Processing..."):
                    video.title = info["title"]
                await db.commit()
        ok += 1
        print(f"  [OK] {vid[:8]} {(title or '')[:50]} views={parsed.get('ext_view_count')}")
        await asyncio.sleep(sleep_s)
    return len(rows), ok, failed


async def pass_speech(dry_run: bool) -> tuple[int, int]:
    """Returns (candidates, computed)."""
    async with async_session() as db:
        result = await db.execute(select(Video.id, Video.title).where(Video.wpm.is_(None)))
        candidates = result.all()
        # Narrow to videos that actually have subtitles.
        with_subs: list[tuple[str, str | None]] = []
        for vid, title in candidates:
            cnt = await db.scalar(select(Subtitle.id).where(Subtitle.video_id == vid).limit(1))
            if cnt:
                with_subs.append((vid, title))

    print(f"[speech] {len(with_subs)} videos with subtitles and wpm IS NULL")
    if dry_run:
        for vid, title in with_subs:
            print(f"  - {vid[:8]} {(title or '')[:50]}")
        return len(with_subs), 0

    computed = 0
    async with async_session() as db:
        for vid, title in with_subs:
            try:
                out = await compute_video_speech_metrics(db, vid)
            except Exception:
                logger.exception("backfill: speech metrics failed for %s", vid)
                out = None
            if out:
                computed += 1
                print(f"  [OK] {vid[:8]} {(title or '')[:50]} wpm={out[0]} density={out[1]}")
    return len(with_subs), computed


async def main():
    ap = argparse.ArgumentParser(description="Backfill video external metadata + speech metrics")
    ap.add_argument("--dry-run", action="store_true", help="list candidates without writing")
    ap.add_argument("--skip-external", action="store_true", help="skip the yt-dlp pass")
    ap.add_argument("--skip-speech", action="store_true", help="skip the local WPM/density pass")
    ap.add_argument("--sleep", type=float, default=1.0, help="seconds between yt-dlp calls")
    args = ap.parse_args()

    if not args.skip_external:
        c, ok, failed = await pass_external(args.dry_run, args.sleep)
        print(f"[external] done: {ok} ok, {failed} failed of {c}\n")
    if not args.skip_speech:
        c, computed = await pass_speech(args.dry_run)
        print(f"[speech] done: {computed} computed of {c}")


if __name__ == "__main__":
    asyncio.run(main())

"""Re-download production videos at real 720p and replace the blurry 360p files.

Root cause being fixed: 46 of 49 published videos were saved as 640x360 source
because yt-dlp only got format 18 (player_client=web,android). The fix in this
branch (player_client=web_safari first) unlocks 720p/1080p. This script
re-downloads each published video at the new quality and atomically replaces
the file on prod — subtitles / translations / vocabulary are never touched.

Safety (the one high-risk step): subtitles are time-locked to the original
video. If YouTube re-cut the source (longer/shorter), replacing the file would
desync every subtitle. So we compare the new duration against the DB value and
skip with a warning when it differs by more than DURATION_TOLERANCE_SEC.

Usage:
    python scripts/rebackfill_video_quality.py                # dry-run over all published videos
    python scripts/rebackfill_video_quality.py --limit 3      # actually run, first 3 only
    python scripts/rebackfill_video_quality.py --video-id <uuid>
    python scripts/rebackfill_video_quality.py --run          # full run
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
# Make `app` importable when run as `python scripts/...` from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import paramiko
from sqlalchemy import text

from app.core.config import Settings
from app.services.thumbnail_service import extract_frame_thumbnail, local_thumbnail_stems
from app.tasks.video_processing import _download_video

# === prod connection ===
PROD_HOST = "47.122.109.52"
PROD_USER = "root"
PROD_PASS = "Ming0118"
PROD_MEDIA_DIR = "/app/media"

# A re-cut source longer/shorter than this is refused: subtitles would desync.
DURATION_TOLERANCE_SEC = 2.0
# Min free disk on prod before we stop, in bytes.
MIN_FREE_DISK_BYTES = 5 * 1024 * 1024 * 1024
# SFTP over this link times out often; retry a few times per file.
UPLOAD_ATTEMPTS = 4

LOG_PATH = Path("C:/tmp/rebackfill_log.txt")
PROD_DB_CONTAINER = "speaking-db-1"


def log(msg: str) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


# ---------------------------------------------------------------------------
# SSH / SFTP helpers (copied from batch_process.py — that script proved the
# retry pattern; see its comment about single-attempt uploads leaving 404s).
# ---------------------------------------------------------------------------


def ssh_client() -> paramiko.SSHClient:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(PROD_HOST, 22, PROD_USER, PROD_PASS, timeout=20, look_for_keys=False, allow_agent=False)
    return c


def prod_run(cmd: str, t: int = 120) -> str:
    c = ssh_client()
    try:
        _, so, se = c.exec_command(cmd, timeout=t)
        return (so.read().decode("utf-8", errors="replace") + se.read().decode("utf-8", errors="replace")).strip()
    finally:
        c.close()


def prod_sftp_put(local: Path, remote: str) -> None:
    c = ssh_client()
    try:
        sftp = c.open_sftp()
        try:
            sftp.put(str(local), remote)
        finally:
            sftp.close()
    finally:
        c.close()


def prod_db(sql: str) -> list:
    """Run a read-only SELECT against the prod DB via docker exec psql."""
    out = prod_run(
        f"docker exec {PROD_DB_CONTAINER} psql -U seeword -d seeword -t -A -F'|' -c \"{sql}\"",
        t=60,
    )
    rows = []
    for line in out.splitlines():
        line = line.strip()
        if line and not line.startswith("("):
            rows.append(line.split("|"))
    return rows


def prod_free_disk_bytes() -> int:
    out = prod_run("df -B1 / | tail -1 | awk '{print $4}'", t=30)
    try:
        return int(out.strip())
    except ValueError:
        return 0


# ---------------------------------------------------------------------------
# Local helpers
# ---------------------------------------------------------------------------


async def ffprobe_field(path: Path, entries: str) -> str:
    proc = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        entries,
        "-of",
        "csv=p=0",
        str(path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode().strip().split("\n")[0]


async def ffprobe_duration(path: Path) -> float | None:
    proc = await asyncio.create_subprocess_exec(
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        str(path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    try:
        return float(stdout.decode().strip())
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Main per-video pipeline
# ---------------------------------------------------------------------------


async def process_one(video_id: str, source_url: str, db_duration: float, dry_run: bool) -> dict:
    """Returns a result dict with status: done | skipped | failed + reason."""
    result = {"id": video_id, "status": "failed", "reason": "", "new_height": None, "old_height": None}
    settings = Settings()
    media_dir = Path(settings.local_media_path).resolve()
    raw = media_dir / f"{video_id}_raw.mp4"

    # 0. Disk-space guard before downloading (download is the big space user).
    if not dry_run:
        free = prod_free_disk_bytes()
        if free < MIN_FREE_DISK_BYTES:
            result["reason"] = f"prod disk low ({free / 1e9:.1f}G free)"
            return result

    # 1. Download at the new (fixed) quality.
    #    _download_video writes to {video_id}_raw.mp4; move any existing aside.
    backup = media_dir / f"{video_id}_raw.mp4.360p.bak"
    if raw.exists():
        backup.unlink(missing_ok=True)
        raw.rename(backup)
    log(f"[{video_id[:8]}] downloading {source_url}")
    # Download timeout: scale with video length. A 1000s 720p video is ~100MB
    # and at ~200KB/s (proxy-dependent) takes ~8 min; a hung download should
    # not block the rest of the queue.
    download_timeout = max(300, int(db_duration * 1.5))
    try:
        new_path_str = await asyncio.wait_for(_download_video(source_url, video_id), timeout=download_timeout)
    except TimeoutError:
        if backup.exists():
            backup.rename(raw)
        result["reason"] = f"download timed out after {download_timeout}s"
        return result
    if not new_path_str:
        # restore backup so the video isn't left without a raw file
        if backup.exists():
            backup.rename(raw)
        result["reason"] = "download failed"
        return result
    new_path = Path(new_path_str)

    # 2. Probe new file: height + duration.
    new_height_str = await ffprobe_field(new_path, "stream=height")
    try:
        new_height = int(new_height_str) if new_height_str else None
    except ValueError:
        new_height = None
    new_duration = await ffprobe_duration(new_path)
    result["new_height"] = new_height

    # Old height for comparison.
    old_height_str = await ffprobe_field(backup, "stream=height") if backup.exists() else ""
    try:
        result["old_height"] = int(old_height_str) if old_height_str else None
    except ValueError:
        result["old_height"] = None

    # 3. Duration safety check — subtitles are time-locked to the original.
    if new_duration is None:
        new_path.unlink(missing_ok=True)
        if backup.exists():
            backup.rename(raw)
        result["reason"] = "could not probe new duration"
        return result
    if abs(new_duration - db_duration) > DURATION_TOLERANCE_SEC:
        new_path.unlink(missing_ok=True)
        if backup.exists():
            backup.rename(raw)
        result["reason"] = f"duration mismatch db={db_duration:.1f}s new={new_duration:.1f}s"
        return result

    # 4. Skip if the new file is not actually an upgrade.
    if new_height is not None and result["old_height"] is not None and new_height <= result["old_height"]:
        new_path.unlink(missing_ok=True)
        if backup.exists():
            backup.rename(raw)
        result["status"] = "skipped"
        result["reason"] = f"no upgrade ({result['old_height']}p → {new_height}p)"
        return result

    if dry_run:
        size_mb = new_path.stat().st_size / 1e6
        log(
            f"[{video_id[:8]}] DRY-RUN ok: {result['old_height']}p → {new_height}p, "
            f"{size_mb:.1f}MB, dur db={db_duration:.1f}s new={new_duration:.1f}s"
        )
        # dry-run: restore backup, drop the new file
        new_path.unlink(missing_ok=True)
        if backup.exists():
            backup.rename(raw)
        result["status"] = "done"
        result["reason"] = f"dry-run {result['old_height']}p→{new_height}p {size_mb:.0f}MB"
        return result

    # 5. Remux (the new file IS the target; _download_video already produced a
    #    clean mp4, so we just add faststart via a copy pass).
    remuxed = media_dir / f"{video_id}_720p.mp4"
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-y",
        "-i",
        str(new_path),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        str(remuxed),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0 or not remuxed.exists():
        remuxed.unlink(missing_ok=True)
        new_path.unlink(missing_ok=True)
        if backup.exists():
            backup.rename(raw)
        result["reason"] = f"remux failed: {stderr.decode()[:150]}"
        return result

    # 6. Upload under a temp name, then atomically rename on the server. If we
    #    uploaded straight to the live name and SFTP died mid-file, the site
    #    would serve a truncated video.
    remote_tmp = f"/tmp/{video_id}_720p.uploading"
    final_name = f"{video_id}_720p.mp4"
    uploaded = False
    for attempt in range(UPLOAD_ATTEMPTS):
        try:
            prod_sftp_put(remuxed, remote_tmp)
            out = prod_run(
                f"docker cp {remote_tmp} speaking-backend-1:{PROD_MEDIA_DIR}/{final_name}.new"
                f" && docker exec speaking-backend-1 mv {PROD_MEDIA_DIR}/{final_name}.new {PROD_MEDIA_DIR}/{final_name}"
                f" && rm {remote_tmp} && echo ATOMIC_OK",
                t=300,
            )
            if "ATOMIC_OK" in out:
                uploaded = True
                break
            raise RuntimeError(f"docker cp/mv did not confirm: {out.strip()[:150]}")
        except Exception as e:
            log(f"[{video_id[:8]}] upload attempt {attempt + 1}/{UPLOAD_ATTEMPTS} failed: {e}")
            time.sleep(5 * (attempt + 1))
    if not uploaded:
        remuxed.unlink(missing_ok=True)
        new_path.unlink(missing_ok=True)
        if backup.exists():
            backup.rename(raw)
        result["reason"] = "upload failed after retries"
        return result

    # 7. Update prod DB: point video_url_720p at the new file.
    prod_run(
        f"docker exec {PROD_DB_CONTAINER} psql -U seeword -d seeword -c "
        f"\"UPDATE videos SET video_url_720p='/media/{final_name}' WHERE id='{video_id}'\"",
        t=60,
    )

    # 8. Regenerate the cover from the higher-res file (existing cover was
    #    extracted from the 360p and is equally blurry).
    try:
        thumbs = local_thumbnail_stems(video_id)
        if thumbs:
            dest = thumbs[0]  # keep existing extension
            ok = await extract_frame_thumbnail(remuxed, dest)
            if ok and dest.exists():
                remote_thumb_tmp = f"/tmp/{dest.name}.uploading"
                try:
                    prod_sftp_put(dest, remote_thumb_tmp)
                    prod_run(
                        f"docker cp {remote_thumb_tmp} speaking-backend-1:{PROD_MEDIA_DIR}/{dest.name}"
                        f" && rm {remote_thumb_tmp} && echo THUMB_OK",
                        t=120,
                    )
                except Exception as e:
                    log(f"[{video_id[:8]}] thumb upload failed (non-fatal): {e}")
    except Exception as e:
        log(f"[{video_id[:8]}] thumb regen failed (non-fatal): {e}")

    # 9. Cleanup local artifacts, keep the new raw as the on-disk source.
    remuxed.unlink(missing_ok=True)
    backup.unlink(missing_ok=True)
    result["status"] = "done"
    result["reason"] = f"{result['old_height']}p→{new_height}p uploaded"
    log(f"[{video_id[:8]}] DONE {result['old_height']}p → {new_height}p")
    return result


async def main_async(args: argparse.Namespace) -> None:
    dry_run = not args.run and args.limit is None and not args.video_id
    if args.limit is not None and not args.run:
        # --limit N without --run still runs (that's the "pilot" mode)
        dry_run = False

    # Pull the published-video list from prod DB.
    where = "is_published=true AND source_url LIKE 'https://www.youtube.com/%'"
    if args.video_id:
        where += f" AND id='{args.video_id}'"
    rows = prod_db(f"SELECT id, source_url, duration FROM videos WHERE {where} ORDER BY created_at")
    log(f"Found {len(rows)} published videos on prod (dry_run={dry_run})")
    if args.limit:
        rows = rows[: args.limit]

    # Resume support: skip videos that already have a real 720p file on prod.
    if not args.video_id and not args.force:
        done_ids = {
            r[0]
            for r in prod_db(
                "SELECT id FROM videos WHERE is_published=true AND video_url_720p LIKE '/media/%_720p.mp4'"
            )
        }
        before = len(rows)
        rows = [r for r in rows if r[0] not in done_ids]
        if before != len(rows):
            log(f"Resume: skipped {before - len(rows)} already-done videos, {len(rows)} remaining")

    results = []
    for i, (vid, source_url, dur) in enumerate(rows, 1):
        try:
            db_duration = float(dur)
        except (TypeError, ValueError):
            log(f"[{vid[:8]}] SKIP: no duration in DB")
            continue
        log(f"=== [{i}/{len(rows)}] {vid[:8]} ===")
        try:
            r = await process_one(vid, source_url, db_duration, dry_run)
        except Exception as e:
            r = {"id": vid, "status": "failed", "reason": f"exception: {e}", "new_height": None, "old_height": None}
        results.append(r)
        log(f"[{vid[:8]}] -> {r['status']}: {r['reason']}")

    # Summary
    done = [r for r in results if r["status"] == "done"]
    skipped = [r for r in results if r["status"] == "skipped"]
    failed = [r for r in results if r["status"] == "failed"]
    print()
    print("=" * 60)
    print(f"SUMMARY: {len(done)} done, {len(skipped)} skipped, {len(failed)} failed")
    for r in failed:
        print(f"  FAILED {r['id'][:8]}: {r['reason']}")
    print(f"Log: {LOG_PATH}")


def main() -> None:
    p = argparse.ArgumentParser(description="Re-download prod videos at real 720p")
    p.add_argument("--run", action="store_true", help="actually run (default is dry-run)")
    p.add_argument("--limit", type=int, default=None, help="process only the first N videos")
    p.add_argument("--video-id", type=str, default=None, help="process a single video")
    p.add_argument("--force", action="store_true", help="re-process videos that already have a 720p file")
    args = p.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()

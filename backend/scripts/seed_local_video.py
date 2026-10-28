"""Seed a local video file into the app and hand it to the processing pipeline.

Split note (2026-10): the cloud backend no longer transcribes locally — WhisperX
moved into the standalone ``gpu-worker/`` component. This script therefore seeds
the media + DB row and enqueues the pipeline head (``process_video``), which
stages the raw file (OSS when configured) and enqueues GPU transcription. The
transcription callback persists subtitles and runs the tail (translation,
annotation, transcoding).

The multi-resolution transcode below still runs locally so the seeded row is
playable immediately; the tail may overwrite the URLs it produces.

Usage:
    cd backend && python scripts/seed_local_video.py media/videos/eHJnEHyyN1Y.mp4 \
        --source-url "https://www.youtube.com/watch?v=eHJnEHyyN1Y" \
        --title "6 Tips on Being a Successful Entrepreneur | John Mullins | TED"
"""

import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import async_session
from app.models.video import Video, VideoSource, VideoStatus

TRANSCODE_PROFILES = {
    "480p": {"height": 480, "bitrate": "800k"},
    "720p": {"height": 720, "bitrate": "1500k"},
    "1080p": {"height": 1080, "bitrate": "3000k"},
}


async def seed_local_video(
    video_path: str,
    source_url: str,
    title: str,
    category: str = "ted",
    is_official: bool = True,
):
    settings = get_settings()
    media_dir = Path(settings.local_media_path).resolve()

    # Resolve the video file
    video_file = Path(video_path)
    if not video_file.is_absolute():
        video_file = (Path(__file__).parent.parent / video_path).resolve()

    if not video_file.exists():
        print(f"[ERROR] Video file not found: {video_file}")
        return False

    print(f"Video file: {video_file} ({video_file.stat().st_size / 1024 / 1024:.1f} MB)")

    # Find an existing row by the *original* source URL (it is overwritten with
    # the local raw path below, which is what the pipeline head expects).
    async with async_session() as db:
        result = await db.execute(select(Video).where(Video.source_url == source_url))
        existing = result.scalars().first()
        if existing:
            print(f"[UPDATE] Video already exists: {existing.title} (id={existing.id})")
            video = existing
            video_id = video.id
        else:
            video_id = str(uuid.uuid4())
            video = Video(
                id=video_id,
                title=title,
                source_url=source_url,
                video_source=VideoSource.local,
                thumbnail_url=f"https://i.ytimg.com/vi/{source_url.split('v=')[-1]}/maxresdefault.jpg",
                duration=None,
                is_official=is_official,
                processing_mode="full",
                topic_tags=category,
                status=VideoStatus.pending_processing,
            )
            db.add(video)
            print(f"[DB] Created video record: id={video_id}")
        await db.commit()

    # Step 1: Copy/rename video to media dir as {video_id}_raw.mp4
    raw_path = media_dir / f"{video_id}_raw.mp4"
    if not raw_path.exists():
        import shutil

        shutil.copy2(str(video_file), str(raw_path))
        print(f"[COPY] {video_file.name} -> {raw_path.name}")
    else:
        print(f"[SKIP] Raw file already exists: {raw_path.name}")

    # Step 2: Transcode to multi-resolution (h264+aac)
    import subprocess

    urls = {}
    for label, profile in TRANSCODE_PROFILES.items():
        out_path = media_dir / f"{video_id}_{label}.mp4"
        if out_path.exists():
            urls[label] = f"/media/{out_path.name}"
            print(f"  [SKIP] {label} already exists: {out_path.name}")
            continue

        print(f"  [TRANSCODE] {label} ({profile['height']}p)...")
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(raw_path),
            "-vf",
            f"scale=-2:{profile['height']}",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-b:v",
            profile["bitrate"],
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(out_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode == 0 and out_path.exists():
            urls[label] = f"/media/{out_path.name}"
            print(f"  [OK] {label}: {out_path.name} ({out_path.stat().st_size / 1024 / 1024:.1f} MB)")
        else:
            print(f"  [WARN] {label} failed: {proc.stderr[:200]}")

    # Step 3: Point the row at the local raw file and record the variant URLs.
    # ``source_url`` must be the local path for ``video_source=local``: the
    # pipeline head uses it to stage the media for the GPU worker.
    async with async_session() as db:
        result = await db.execute(select(Video).where(Video.id == video_id))
        video = result.scalars().one()
        video.source_url = str(raw_path)
        video.video_source = VideoSource.local
        video.video_url_480p = urls.get("480p")
        video.video_url_720p = urls.get("720p", f"/media/{video_id}.mp4")
        video.video_url_1080p = urls.get("1080p")
        video.status = VideoStatus.pending_processing
        video.processing_step = None
        video.error_message = None
        await db.commit()
        print(f"[DB] Updated video: source_url -> {raw_path.name}; URLs: {list(urls.keys())}")

    # Step 4: Hand off to the pipeline (head -> GPU worker -> tail).
    from app.tasks.video_processing import process_video

    process_video.delay(video_id)
    print(f"[QUEUE] Enqueued process_video for {video_id}")

    print("\n[DONE] Video seeded and enqueued!")
    print(f"  ID: {video_id}")
    print(f"  Title: {title}")
    print(f"  URL: http://localhost:3000/watch/{video_id}")
    print("  Subtitles are produced by the GPU worker; watch the video status in the admin panel.")
    return True


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Seed a local video into the SeeWord app")
    parser.add_argument("video_path", help="Path to the video file")
    parser.add_argument("--source-url", required=True, help="Original source URL")
    parser.add_argument("--title", default=None, help="Video title")
    parser.add_argument("--category", default="ted", help="Category tag")
    args = parser.parse_args()

    title = args.title or Path(args.video_path).stem
    asyncio.run(
        seed_local_video(
            video_path=args.video_path,
            source_url=args.source_url,
            title=title,
            category=args.category,
        )
    )

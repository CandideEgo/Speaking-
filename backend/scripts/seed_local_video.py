"""Seed a local video file into the Speaking app with full pipeline.

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

from sqlalchemy import delete, select

from app.core.config import get_settings
from app.core.database import async_session
from app.models.subtitle import Subtitle
from app.models.video import Video, VideoSource, VideoStatus


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

    # Check if video already exists in DB by source_url
    async with async_session() as db:
        result = await db.execute(select(Video).where(Video.source_url == source_url))
        existing = result.scalars().first()
        if existing:
            print(f"[UPDATE] Video already exists: {existing.title} (id={existing.id})")
            await db.execute(delete(Subtitle).where(Subtitle.video_id == existing.id))
            await db.commit()
            video = existing
            video.status = VideoStatus.processing
            await db.commit()
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
                status=VideoStatus.processing,
            )
            db.add(video)
            await db.commit()
            print(f"[DB] Created video record: id={video_id}")

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

    TRANSCODE_PROFILES = {
        "480p": {"height": 480, "bitrate": "800k"},
        "720p": {"height": 720, "bitrate": "1500k"},
        "1080p": {"height": 1080, "bitrate": "3000k"},
    }

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

    # Step 3: Update video record with URLs
    async with async_session() as db:
        result = await db.execute(select(Video).where(Video.id == video_id))
        video = result.scalars().one()
        video.video_url_480p = urls.get("480p")
        video.video_url_720p = urls.get("720p", f"/media/{video_id}.mp4")
        video.video_url_1080p = urls.get("1080p")
        await db.commit()
        print(f"[DB] Updated video URLs: {list(urls.keys())}")

    # Step 4: Transcribe with WhisperX
    print("[TRANSCRIBE] Running WhisperX transcription...")
    from app.services.transcription import TranscriptionService

    svc = TranscriptionService()
    subs = await svc.transcribe(str(raw_path), VideoSource.local)
    print(f"[TRANSCRIBE] Got {len(subs)} subtitle segments")

    # Step 5: Translate subtitles to Chinese
    print("[TRANSLATE] Translating subtitles to Chinese...")
    from app.services.translation import get_translation_service

    translation_svc = get_translation_service()
    batch_size = translation_svc.batch_size

    for i in range(0, len(subs), batch_size):
        batch = subs[i : i + batch_size]
        texts = [s["text"] for s in batch]
        translations = await translation_svc.translate_batch(texts)
        for j, t in enumerate(translations):
            if i + j < len(subs):
                subs[i + j]["text_zh"] = t or ""

    translated = sum(1 for s in subs if s.get("text_zh"))
    print(f"[TRANSLATE] Translated {translated}/{len(subs)} subtitles")

    # Step 6: Save subtitles to DB
    async with async_session() as db:
        await db.execute(delete(Subtitle).where(Subtitle.video_id == video_id))

        for i, sub in enumerate(subs):
            db.add(
                Subtitle(
                    video_id=video_id,
                    start_time=sub["start"],
                    end_time=sub["end"],
                    text_en=sub["text"],
                    text_zh=sub.get("text_zh", ""),
                    sentence_index=i,
                )
            )

        result = await db.execute(select(Video).where(Video.id == video_id))
        video = result.scalars().one()
        video.status = VideoStatus.ready
        video.duration = subs[-1]["end"] if subs else None
        await db.commit()
        print(f"[DB] Saved {len(subs)} subtitles, video status -> ready")

    print("\n[DONE] Video seeded successfully!")
    print(f"  ID: {video_id}")
    print(f"  Title: {title}")
    print(f"  Subtitles: {len(subs)}")
    print(f"  URL: http://localhost:3000/watch/{video_id}")
    return True


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Seed a local video into the Speaking app")
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

"""Seed the test video 7ARBJQn6QkM directly into DB, bypassing Celery task."""
import asyncio, json, uuid, sys, os
from pathlib import Path
from datetime import datetime, timezone

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from app.core.database import async_session
from app.models.video import Video, VideoStatus, Platform
from app.models.subtitle import Subtitle
from sqlalchemy import select

JSON3_PATH = Path(__file__).parent / "youtube_cookies.txt"  # ignored, we read from Win path
# Read from the Windows-accessible temp location
JSON3_PATH = Path(r"/mnt/c/Users/Administrator/translate-tool/temp/7ARBJQn6QkM.en.json3")

VIDEO_DATA = {
    "id": str(uuid.uuid4()),
    "title": "NVIDIA CEO Jensen Huang's Vision for the Future",
    "source_url": "https://www.youtube.com/watch?v=7ARBJQn6QkM",
    "platform": Platform.youtube,
    "youtube_video_id": "7ARBJQn6QkM",
    "thumbnail_url": "https://i.ytimg.com/vi/7ARBJQn6QkM/maxresdefault.jpg",
    "duration": 3783.0,
    "is_official": True,
    "processing_mode": "lightweight",
}


async def main():
    # Parse JSON3
    if not JSON3_PATH.exists():
        print(f"JSON3 not found at {JSON3_PATH}")
        return

    data = json.loads(JSON3_PATH.read_text("utf-8"))
    subs = []
    for ev in data["events"]:
        if "segs" not in ev or ev.get("aAppend"):
            continue
        words = [s["utf8"] for s in ev["segs"] if "utf8" in s]
        if not words:
            continue
        text = " ".join(w.strip() for w in words).strip()
        if text:
            subs.append({
                "start": ev["tStartMs"] / 1000,
                "end": (ev["tStartMs"] + ev["dDurationMs"]) / 1000,
                "text": text,
            })

    print(f"Parsed {len(subs)} subtitle segments")

    async with async_session() as db:
        # Check if already exists
        result = await db.execute(
            select(Video).where(Video.source_url == VIDEO_DATA["source_url"])
        )
        existing = result.scalar_one_or_none()

        if existing:
            print(f"Video already exists: {existing.id}, status={existing.status.value}")
            print(f"Subtitles: {len(existing.subtitles) if existing.subtitles else 0}")
            video_id = existing.id
        else:
            # Create video
            video = Video(
                id=VIDEO_DATA["id"],
                title=VIDEO_DATA["title"],
                source_url=VIDEO_DATA["source_url"],
                platform=VIDEO_DATA["platform"],
                youtube_video_id=VIDEO_DATA["youtube_video_id"],
                thumbnail_url=VIDEO_DATA["thumbnail_url"],
                duration=VIDEO_DATA["duration"],
                is_official=VIDEO_DATA["is_official"],
                processing_mode=VIDEO_DATA["processing_mode"],
                status=VideoStatus.processing,
            )
            db.add(video)
            await db.commit()
            video_id = video.id
            print(f"Created video: {video_id}")

        # Delete old subtitles if re-seeding
        if existing and existing.subtitles:
            for s in existing.subtitles:
                await db.delete(s)
            await db.commit()
            print("Deleted old subtitles")

        # Insert subtitles (batch of 500 for performance)
        batch = []
        for i, sub in enumerate(subs):
            batch.append(Subtitle(
                video_id=video_id,
                start_time=sub["start"],
                end_time=sub["end"],
                text_en=sub["text"],
                sentence_index=i,
            ))
            if len(batch) >= 500:
                for s in batch:
                    db.add(s)
                await db.commit()
                print(f"  Inserted {i+1}/{len(subs)} subtitles...")
                batch = []

        # Insert remaining
        if batch:
            for s in batch:
                db.add(s)
            await db.commit()
            print(f"  Inserted all {len(subs)} subtitles")

        # Mark as ready (English only, no Chinese translation yet)
        result2 = await db.execute(select(Video).where(Video.id == video_id))
        video = result2.scalar_one()
        video.status = VideoStatus.ready
        await db.commit()

        print(f"\nDone! Video ID: {video_id}")
        print(f"Status: ready, Subtitles: {len(subs)}")
        print(f"Access at: http://localhost:3000/watch/{video_id}")


if __name__ == "__main__":
    asyncio.run(main())

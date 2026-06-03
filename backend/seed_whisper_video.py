"""Seed the Whisper-transcribed version of 7ARBJQn6QkM directly into DB."""
import asyncio, re, uuid, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.core.database import async_session
from app.models.video import Video, VideoStatus, Platform
from app.models.subtitle import Subtitle
from sqlalchemy import select

WHISPER_OUTPUT = Path(r"/mnt/c/Users/Administrator/translate-tool/test/whisper_7ARBJQn6QkM_sentences.txt")

VIDEO_DATA = {
    "id": str(uuid.uuid4()),
    "title": "NVIDIA CEO Jensen Huang's Vision for the Future [Whisper]",
    "source_url": "https://www.youtube.com/watch?v=7ARBJQn6QkM_whisper",  # unique URL
    "platform": Platform.youtube,
    "youtube_video_id": "7ARBJQn6QkM",
    "thumbnail_url": "https://i.ytimg.com/vi/7ARBJQn6QkM/maxresdefault.jpg",
    "duration": 3783.0,
    "is_official": True,
    "processing_mode": "lightweight",
}


def parse_time(ts: str) -> float:
    """Parse HH:MM:SS to seconds."""
    h, m, s = ts.split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


async def main():
    if not WHISPER_OUTPUT.exists():
        print(f"Whisper output not found at {WHISPER_OUTPUT}")
        return

    content = WHISPER_OUTPUT.read_text("utf-8")
    subs = []
    for line in content.split("\n"):
        m = re.match(
            r"\[(\d{2}):(\d{2}):(\d{2})\s*->\s*(\d{2}):(\d{2}):(\d{2})\]\s+(.+)", line
        )
        if m:
            subs.append({
                "start": int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)),
                "end": int(m.group(4)) * 3600 + int(m.group(5)) * 60 + int(m.group(6)),
                "text": m.group(7).strip(),
            })

    print(f"Parsed {len(subs)} segments from Whisper output")

    async with async_session() as db:
        result = await db.execute(
            select(Video).where(Video.source_url == VIDEO_DATA["source_url"])
        )
        existing = result.scalar_one_or_none()

        if existing:
            print(f"Whisper video already exists: {existing.id}")
            # Delete old subtitles and recreate
            stmt = select(Subtitle).where(Subtitle.video_id == existing.id)
            old_subs = await db.execute(stmt)
            for s in old_subs.scalars().all():
                await db.delete(s)
            await db.commit()
            video_id = existing.id
            print("Cleared old subtitles")
        else:
            video = Video(**{k: v for k, v in VIDEO_DATA.items() if k != "id"})
            video.id = VIDEO_DATA["id"]
            video.status = VideoStatus.processing
            db.add(video)
            await db.commit()
            video_id = video.id
            print(f"Created Whisper video: {video_id}")

        # Insert subtitles in batches
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

        for s in batch:
            db.add(s)
        await db.commit()
        print(f"  Inserted all {len(subs)} subtitles")

        # Mark ready
        result2 = await db.execute(select(Video).where(Video.id == video_id))
        video = result2.scalar_one()
        video.status = VideoStatus.ready
        await db.commit()

        print(f"\nDone! Whisper Video ID: {video_id}")
        print(f"Status: ready, Subtitles: {len(subs)} (sentence-level)")
        print(f"Access at: http://localhost:3000/watch/{video_id}")


if __name__ == "__main__":
    asyncio.run(main())

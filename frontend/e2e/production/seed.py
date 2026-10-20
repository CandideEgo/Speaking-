"""Only run inside the isolated smoke database; create playable media without network access."""
import asyncio
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, "/app")
from sqlalchemy import select
from app.core.config import get_settings
from app.core.database import async_session
from app.core.redis import get_redis
from app.models.video import Video
from app.models.subtitle import Subtitle


async def main():
    if get_settings().env != "testing" or "@db:5432/smoke" not in get_settings().database_url:
        raise RuntimeError("Smoke seed refuses to run outside the isolated test database")
    async with async_session() as db:
        video = await db.scalar(select(Video).where(Video.source_url == "https://example.com/e2e-demo.mp4"))
        if video is None:
            raise RuntimeError("Run seed_e2e.py first")
        subtitles = (await db.scalars(select(Subtitle).where(Subtitle.video_id == video.id).order_by(Subtitle.sentence_index))).all()
        subtitles[2].text_en = (
            "Remember to repeat each sentence out loud. Take a little time to listen carefully, "
            "notice the rhythm of each phrase, and practise speaking with confidence every day."
        )
        subtitles[3].text_en = "Keep practising, one sentence at a time."
        if len(subtitles) == 4:
            for index in range(4, 16):
                db.add(Subtitle(
                    video_id=video.id, sentence_index=index,
                    start_time=index * 4.0, end_time=(index + 1) * 4.0,
                    text_en=f"Practice sentence {index + 1}: small steps help us learn something new every day.",
                    text_zh=f"第 {index + 1} 句：每天进步一点，持续积累。",
                ))
        target = Path("/app/media") / f"{video.id}.mp4"
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "color=c=0x244b5a:s=640x360:r=24",
            "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
            "-t", "64", "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-movflags", "+faststart", str(target),
        ], check=True)
        video.storage_mode = "local"
        video.duration = 64.0
        video.video_url_720p = f"/media/{video.id}.mp4"
        await db.commit()
        await get_redis().delete(f"video:detail:{video.id}")
        print("Smoke media ready (64 seconds, 16 sentences including a long cue; generated locally)")


asyncio.run(main())

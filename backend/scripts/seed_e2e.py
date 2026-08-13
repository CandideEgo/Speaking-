"""Seed a minimal official "ready" video + bilingual subtitles for CI e2e tests.

The Playwright watch-page tests skip when the home page has no video link; CI
starts from an empty database, so without a seed those tests never execute in
CI (the core watch journey was silently uncovered). This script creates one
official ready video with subtitles — no network, no GPU, no media file — and
is idempotent (exits 0 if a suitable video already exists).

Usage:
    cd backend && python scripts/seed_e2e.py

Runs against the configured DATABASE_URL (CI sets it for the e2e job).
"""

import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

# Make `app` importable when run as `python scripts/seed_e2e.py` from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import async_session  # noqa: E402
from app.models.subtitle import Subtitle  # noqa: E402
from app.models.video import Video, VideoReviewStatus, VideoSource, VideoStatus  # noqa: E402

TITLE = "E2E Demo Video (CI seed)"

# (start, end, en, zh) — four short bilingual sentences so the watch page has
# something to render and subtitle navigation has room to move.
_DEMO_SUBTITLES = [
    (0.0, 4.2, "Hello and welcome to today's lesson.", "大家好，欢迎来到今天的课程。"),
    (4.2, 8.5, "Today we are going to practice English together.", "今天我们将一起练习英语。"),
    (8.5, 12.0, "Remember to repeat each sentence out loud.", "记住要大声重复每个句子。"),
    (12.0, 16.0, "This is the last sentence of the demo.", "这是演示的最后一句。"),
]


async def main() -> int:
    async with async_session() as db:
        existing = await db.scalar(
            select(Video).where(
                Video.is_official.is_(True),
                Video.status == VideoStatus.ready,
            )
        )
        if existing is not None:
            print(f"seed_e2e: official ready video already present ({existing.id}) — skipping")
            return 0

        video = Video(
            title=TITLE,
            source_url="https://example.com/e2e-demo.mp4",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            review_status=VideoReviewStatus.published.value,
            is_official=True,
            is_featured=True,
            show_on_homepage=True,
            duration=16.0,
        )
        db.add(video)
        await db.flush()
        # Placeholder media URL — the e2e suite asserts page behavior, not
        # playback; the file itself is not required.
        video.video_url_720p = f"/media/{video.id}.mp4"

        for i, (start, end, en, zh) in enumerate(_DEMO_SUBTITLES):
            db.add(
                Subtitle(
                    video_id=video.id,
                    start_time=start,
                    end_time=end,
                    text_en=en,
                    text_zh=zh,
                    sentence_index=i,
                )
            )
        await db.commit()
        print(f"seed_e2e: created official ready video {video.id} with {len(_DEMO_SUBTITLES)} subtitles")
        return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except Exception as exc:  # fail loudly — CI depends on this seed
        print(f"seed_e2e: FAILED: {exc}", file=sys.stderr)
        sys.exit(1)

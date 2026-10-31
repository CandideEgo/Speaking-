"""Batch re-process of the seeded official videos through the GPU worker queue.

Split note (2026-10): this used to transcribe locally with WhisperX and then
export subtitle JSON for manual upload to the server. Both paths are gone after
the GPU worker was extracted into the standalone ``gpu-worker/`` component:

* local WhisperX transcription — the GPU worker owns transcription now;
* the JSON export/upload flow — its consumer (``scripts/upload_reprocessed.py``)
  no longer exists.

What remains is the actual intent: reset each video's subtitles and re-run the
pipeline (head → GPU transcription → callback → tail translation/annotation).

Usage:
    cd backend && python scripts/reprocess_official_videos.py
    cd backend && python scripts/reprocess_official_videos.py --video-id 85cb45ae-06bd-4236-a7ea-ee7fe80cd5c1

Requires DATABASE_URL and REDIS_URL (Celery broker) via backend/.env.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# The 5 official video IDs on the server
OFFICIAL_VIDEO_IDS = [
    "85cb45ae-06bd-4236-a7ea-ee7fe80cd5c1",
    "99728b5c-cb59-47b8-8d2a-60a5f220051c",
    "74b7afab-9d17-4f7d-b071-bc09f70b76a7",
    "bdebe210-7985-4102-a2ba-234c3741b9c5",
    "237f80a4-dced-4be7-9159-a1c8983f24ab",
]


async def reprocess_video(video_id: str) -> bool:
    """Delete old subtitles/word notes, reset the video and enqueue the pipeline head."""
    from sqlalchemy import delete, select

    from app.core.database import async_session
    from app.models.subtitle import Subtitle
    from app.models.video import Video, VideoStatus
    from app.models.word_note import WordAINote

    async with async_session() as db:
        video = (await db.execute(select(Video).where(Video.id == video_id))).scalar_one_or_none()
        if not video:
            print(f"[ERROR] Video {video_id} not found in DB")
            return False

        print(f"Processing: {video.title}")
        print(f"Source: {video.source_url}")

        await db.execute(delete(Subtitle).where(Subtitle.video_id == video_id))
        await db.execute(delete(WordAINote).where(WordAINote.context_source == f"video:{video_id}"))
        video.status = VideoStatus.pending_processing
        video.processing_step = None
        video.processing_progress = 0
        video.error_message = None
        video.quality_flag = None
        await db.commit()
        print("[DB] Cleared subtitles/word notes; video reset to pending_processing")

    from app.tasks.video_processing import process_video

    process_video.delay(video_id)
    print(f"[QUEUE] Enqueued process_video for {video_id}")
    return True


async def main():
    parser = argparse.ArgumentParser(description="Re-process official videos via the GPU worker queue")
    parser.add_argument("--video-id", help="Process a single video by ID")
    args = parser.parse_args()

    ids = [args.video_id] if args.video_id else OFFICIAL_VIDEO_IDS

    results = {}
    for vid in ids:
        print(f"\n{'=' * 60}")
        results[vid] = await reprocess_video(vid)

    print(f"\n{'=' * 60}")
    print("SUMMARY:")
    for vid, ok in results.items():
        print(f"  {vid[:8]}... {'✓ ENQUEUED' if ok else '✗ FAILED'}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())

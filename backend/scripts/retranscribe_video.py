"""Re-transcribe a video through the remote GPU worker.

Split note (2026-10): transcription no longer runs inside the cloud backend. The
GPU worker was extracted into the standalone ``gpu-worker/`` component, so this
script only *requests* a re-run: it deletes the stored subtitles, resets the
pipeline state and enqueues the pipeline head (``process_video``). The head
stages the media and enqueues ``transcribe_video_gpu``; the transcription
callback persists the fresh subtitles and kicks off ``finalize_video``
(translation → annotate → transcode).

Usage:
    cd backend && python scripts/retranscribe_video.py <video_id>

Requires DATABASE_URL and REDIS_URL (Celery broker) via backend/.env.
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


async def retranscribe_video(video_id: str) -> bool:
    """Delete stored subtitles and re-enqueue the video pipeline."""
    from sqlalchemy import delete, select

    from app.core.database import async_session
    from app.models.subtitle import Subtitle
    from app.models.video import Video, VideoStatus

    async with async_session() as db:
        video = (await db.execute(select(Video).where(Video.id == video_id))).scalar_one_or_none()
        if not video:
            print(f"[ERROR] Video {video_id} not found")
            return False

        print(f"Found video: {video.title}")
        print(f"Source: {video.video_source} / {video.source_url}")

        deleted = await db.execute(delete(Subtitle).where(Subtitle.video_id == video_id))
        video.status = VideoStatus.pending_processing
        video.processing_step = None
        video.processing_progress = 0
        video.error_message = None
        video.quality_flag = None
        await db.commit()
        print(f"[DB] Deleted stored subtitles; video reset to pending_processing ({deleted.rowcount} rows)")

    # Imported lazily so the script can run --help without a Celery connection.
    from app.tasks.video_processing import process_video

    process_video.delay(video_id)
    print(f"[QUEUE] Enqueued process_video for {video_id}")
    print("[NEXT] The GPU worker transcribes it; the callback persists subtitles and runs the tail.")
    return True


def main():
    parser = argparse.ArgumentParser(description="Re-transcribe a video via the GPU worker queue")
    parser.add_argument("video_id", help="Video UUID to re-transcribe")
    args = parser.parse_args()

    success = asyncio.run(retranscribe_video(args.video_id))
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

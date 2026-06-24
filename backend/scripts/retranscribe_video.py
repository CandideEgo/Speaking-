"""Re-transcribe a video using Whisper and translate subtitles.

Usage:
    python retranscribe_video.py <video_id> [--skip-translate]

Example:
    python retranscribe_video.py a3d435a8-a2fd-463e-85af-658d755ca35c
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


async def retranscribe_video(video_id: str, skip_translate: bool = False):
    """Re-transcribe a video: delete old subtitles, re-extract audio, transcribe with Whisper, translate."""
    from sqlalchemy import delete, select

    from app.core.database import async_session
    from app.models.subtitle import Subtitle
    from app.models.video import Video, VideoSource, VideoStatus
    from app.services.transcription import TranscriptionService
    from app.tasks.video_processing import _translate_subtitles

    async with async_session() as db:
        # 1. Get video
        result = await db.execute(select(Video).where(Video.id == video_id))
        video = result.scalar_one_or_none()
        if not video:
            logger.error(f"Video {video_id} not found")
            return False

        logger.info(f"Found video: {video.title}")
        logger.info(f"Source: {video.video_source}")
        logger.info(f"Source URL: {video.source_url}")

        # 2. Delete old subtitles
        logger.info("Deleting old subtitles...")
        await db.execute(delete(Subtitle).where(Subtitle.video_id == video_id))
        await db.commit()
        logger.info("Old subtitles deleted")

        # 3. Update status to processing
        video.status = VideoStatus.processing
        await db.commit()
        logger.info("Status updated to processing")

        # 4. Extract audio and transcribe with Whisper
        logger.info("Starting Whisper transcription...")
        service = TranscriptionService()
        try:
            subs = await service.transcribe(video.source_url, video.video_source)
            if not subs:
                logger.error("Transcription failed - no subtitles returned")
                video.status = VideoStatus.error
                video.error_message = "Whisper transcription failed - no output"
                await db.commit()
                return False

            logger.info(f"Transcription complete: {len(subs)} segments")

            # 5. Save English subtitles
            texts = []
            for i, sub in enumerate(subs):
                db.add(
                    Subtitle(
                        video_id=video.id,
                        start_time=sub["start"],
                        end_time=sub["end"],
                        text_en=sub["text"],
                        sentence_index=i,
                    )
                )
                texts.append(sub["text"])

            video.status = VideoStatus.ready_subtitles
            await db.commit()
            logger.info(f"Saved {len(subs)} English subtitles")

            # 6. Translate if not skipped
            if not skip_translate:
                logger.info("Starting translation...")
                translated = await _translate_subtitles(texts)
                translated_count = 0
                for i, t in enumerate(translated):
                    if t:
                        result_sub = await db.execute(
                            select(Subtitle).where(
                                Subtitle.video_id == video.id,
                                Subtitle.sentence_index == i,
                            )
                        )
                        sub_row = result_sub.scalar_one_or_none()
                        if sub_row:
                            sub_row.text_zh = t
                            translated_count += 1

                logger.info(f"Translated {translated_count}/{len(texts)} subtitles")

            # 7. Mark as ready
            video.status = VideoStatus.ready
            await db.commit()
            logger.info(f"Video {video_id} re-transcribed successfully!")

            # 8. Print sample subtitles
            result_subs = await db.execute(
                select(Subtitle).where(Subtitle.video_id == video.id).order_by(Subtitle.sentence_index)
            )
            final_subs = result_subs.scalars().all()
            print("\n" + "=" * 60)
            print("SAMPLE SUBTITLES:")
            print("=" * 60)
            for s in final_subs[:5]:
                print(f"\n[{s.start_time:.1f}s - {s.end_time:.1f}s]")
                print(f"EN: {s.text_en}")
                if s.text_zh:
                    print(f"ZH: {s.text_zh}")
            if len(final_subs) > 5:
                print(f"\n... ({len(final_subs) - 5} more segments)")
            print("=" * 60)

            return True

        except Exception as e:
            logger.exception(f"Transcription failed: {e}")
            video.status = VideoStatus.error
            video.error_message = str(e)
            await db.commit()
            return False


def main():
    parser = argparse.ArgumentParser(description="Re-transcribe a video with Whisper")
    parser.add_argument("video_id", help="Video UUID to re-transcribe")
    parser.add_argument("--skip-translate", action="store_true", help="Skip translation step")
    args = parser.parse_args()

    success = asyncio.run(retranscribe_video(args.video_id, args.skip_translate))
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

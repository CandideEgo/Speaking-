"""Re-process official videos locally: WhisperX transcription → translation →
ECDICT annotation → AI word note prewarm → export for server upload.

Usage:
    cd backend && python scripts/reprocess_official_videos.py
    cd backend && python scripts/reprocess_official_videos.py --video-id 85cb45ae-06bd-4236-a7ea-ee7fe80cd5c1
    cd backend && python scripts/reprocess_official_videos.py --skip-prewarm

This script operates on the LOCAL database. After processing, use the
--export-dir flag to dump subtitle rows as JSON for uploading to the server.
"""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# The 5 official video IDs on the server
OFFICIAL_VIDEO_IDS = [
    "85cb45ae-06bd-4236-a7ea-ee7fe80cd5c1",
    "99728b5c-cb59-47b8-8d2a-60a5f220051c",
    "74b7afab-9d17-4f7d-b071-bc09f70b76a7",
    "bdebe210-7985-4102-a2ba-234c3741b9c5",
    "237f80a4-dced-4be7-9159-a1c8983f24ab",
]


async def reprocess_video(
    video_id: str,
    skip_translate: bool = False,
    skip_prewarm: bool = False,
    export_dir: Path | None = None,
):
    """Full re-process: delete old subs → WhisperX transcribe → translate → annotate → prewarm → export."""
    from sqlalchemy import delete, select

    from app.core.database import async_session
    from app.models.subtitle import Subtitle
    from app.models.video import Video, VideoSource, VideoStatus
    from app.services import ecdict as ecdict_mod
    from app.services.transcription import TranscriptionService
    from app.tasks.video_processing import _translate_subtitles

    async with async_session() as db:
        # 1. Get video
        result = await db.execute(select(Video).where(Video.id == video_id))
        video = result.scalar_one_or_none()
        if not video:
            logger.error(f"Video {video_id} not found in local DB — creating stub")
            return False

        logger.info(f"Processing: {video.title}")
        logger.info(f"Source: {video.source_url}")

        # 2. Delete old subtitles + word notes for this video
        logger.info("Deleting old subtitles...")
        await db.execute(delete(Subtitle).where(Subtitle.video_id == video_id))
        await db.commit()

        # Also delete old AI word notes for this video
        from app.models.word_note import WordAINote

        await db.execute(delete(WordAINote).where(WordAINote.context_source == f"video:{video_id}"))
        await db.commit()

        # 3. Transcribe with WhisperX
        video.status = VideoStatus.processing
        await db.commit()

        logger.info("Starting WhisperX transcription...")
        # Use local video file for transcription (avoids YouTube cookies requirement)
        from app.core.config import get_settings

        settings = get_settings()
        media_dir = Path(settings.local_media_path)
        local_video = media_dir / f"{video.id}_720p.mp4"
        if not local_video.exists():
            local_video = media_dir / f"{video.id}_480p.mp4"
        if not local_video.exists():
            logger.error(f"No local video file found for {video.id} in {media_dir}")
            video.status = VideoStatus.error
            video.error_message = "No local video file for transcription"
            await db.commit()
            return False

        logger.info(f"Using local video file: {local_video}")
        service = TranscriptionService()
        try:
            subs = await service.transcribe(str(local_video), VideoSource.local)
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            video.status = VideoStatus.error
            video.error_message = str(e)
            await db.commit()
            return False

        if not subs:
            logger.error("Transcription returned no subtitles")
            video.status = VideoStatus.error
            video.error_message = "WhisperX transcription failed - no output"
            await db.commit()
            return False

        logger.info(f"Transcription complete: {len(subs)} segments")

        # 4. Save English subtitles WITH words (word-level timestamps)
        texts = []
        for i, sub in enumerate(subs):
            db.add(
                Subtitle(
                    video_id=video.id,
                    start_time=sub["start"],
                    end_time=sub["end"],
                    text_en=sub["text"],
                    sentence_index=i,
                    words=sub.get("words"),  # WhisperX word-level timestamps
                )
            )
            texts.append(sub["text"])

        video.status = VideoStatus.ready_subtitles
        await db.commit()
        logger.info(f"Saved {len(subs)} English subtitles (with word timestamps)")

        # 5. Translate
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

            await db.commit()
            logger.info(f"Translated {translated_count}/{len(texts)} subtitles")

        # 6. ECDICT word-level annotation
        if ecdict_mod.is_available():
            logger.info("Annotating with ECDICT exam levels...")
            result_subs = await db.execute(
                select(Subtitle).where(Subtitle.video_id == video.id).order_by(Subtitle.sentence_index)
            )
            all_subs = result_subs.scalars().all()
            annotated = 0
            for s in all_subs:
                if s.text_en:
                    levels = ecdict_mod.annotate_text(s.text_en)
                    if levels:
                        s.word_levels = levels
                        annotated += 1
            await db.commit()
            logger.info(f"Annotated {annotated}/{len(all_subs)} subtitles with exam levels")
        else:
            logger.warning("ECDICT not available — skipping annotation")

        # 7. Prewarm AI word notes
        if not skip_prewarm:
            try:
                from app.services.word_notes import prewarm_video_notes

                logger.info("Prewarming AI word notes...")
                count = await prewarm_video_notes(db, video.id)
                logger.info(f"Prewarmed {count} AI word notes")
            except Exception as e:
                logger.warning(f"Prewarm failed (non-fatal): {e}")

        # 8. Mark as ready
        video.status = VideoStatus.ready
        video.processing_progress = 100
        await db.commit()

        # 9. Print sample
        result_subs = await db.execute(
            select(Subtitle).where(Subtitle.video_id == video.id).order_by(Subtitle.sentence_index)
        )
        final_subs = result_subs.scalars().all()
        print(f"\n{'=' * 60}")
        print(f"SAMPLE SUBTITLES ({len(final_subs)} total):")
        print("=" * 60)
        for s in final_subs[:3]:
            print(f"\n[{s.start_time:.1f}s - {s.end_time:.1f}s]")
            print(f"EN: {s.text_en}")
            if s.text_zh:
                print(f"ZH: {s.text_zh}")
            if s.word_levels:
                print(f"Levels: {dict(list(s.word_levels.items())[:5])}")
            if s.words:
                print(f"Words: {len(s.words)} word timestamps")
        print("=" * 60)

        # 10. Export for server upload
        if export_dir:
            export_dir.mkdir(parents=True, exist_ok=True)
            export_data = []
            for s in final_subs:
                export_data.append(
                    {
                        "video_id": s.video_id,
                        "start_time": s.start_time,
                        "end_time": s.end_time,
                        "text_en": s.text_en,
                        "text_zh": s.text_zh,
                        "sentence_index": s.sentence_index,
                        "words": s.words,
                        "word_levels": s.word_levels,
                    }
                )
            export_file = export_dir / f"{video_id}.json"
            export_file.write_text(json.dumps(export_data, ensure_ascii=False, indent=2), encoding="utf-8")
            logger.info(f"Exported to {export_file}")

        return True


async def main():
    parser = argparse.ArgumentParser(description="Re-process official videos with WhisperX")
    parser.add_argument("--video-id", help="Process a single video by ID")
    parser.add_argument("--skip-translate", action="store_true", help="Skip translation")
    parser.add_argument("--skip-prewarm", action="store_true", help="Skip AI word note prewarm")
    parser.add_argument(
        "--export-dir", type=str, default="reprocess_export", help="Directory to export subtitle JSON for server upload"
    )
    args = parser.parse_args()

    export_dir = Path(args.export_dir)

    if args.video_id:
        ids = [args.video_id]
    else:
        ids = OFFICIAL_VIDEO_IDS

    results = {}
    for vid in ids:
        logger.info(f"\n{'=' * 60}")
        logger.info(f"Processing video: {vid}")
        logger.info("=" * 60)
        ok = await reprocess_video(
            vid,
            skip_translate=args.skip_translate,
            skip_prewarm=args.skip_prewarm,
            export_dir=export_dir,
        )
        results[vid] = ok

    print(f"\n{'=' * 60}")
    print("SUMMARY:")
    print("=" * 60)
    for vid, ok in results.items():
        status = "✓ SUCCESS" if ok else "✗ FAILED"
        print(f"  {vid[:8]}... {status}")
    print("=" * 60)

    if export_dir:
        print(f"\nExported subtitle files in: {export_dir}/")
        print("Upload to server with: python scripts/upload_reprocessed.py")


if __name__ == "__main__":
    asyncio.run(main())

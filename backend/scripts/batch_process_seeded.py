"""Batch process 12 seeded videos: translate + annotate + prewarm.

Bypasses Celery — runs directly via asyncio for speed.
Skips downloading/transcoding (YouTube embed playback).
"""

import asyncio
import sys

sys.path.insert(0, ".")

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import async_session
from app.core.logging import get_logger
from app.models.subtitle import Subtitle
from app.models.video import Video, VideoStatus
from app.services import ecdict
from app.services.translation import TranslationService

logger = get_logger(__name__)

VIDEO_IDS = [
    "8cc0dc65-f942-4c2e-a83b-623728870268",  # Zuckerberg (77/477)
    "68d9d7fb-c52f-46da-acb2-52a91e2d2eba",  # Oprah (23/1223)
    "9a1a91a4-cc89-44a4-b9df-82d2f116fb90",  # English for Beginner (0/382)
    "ef6cd4db-81e2-4ac1-8069-cef0d7fafb01",  # Learn English at Home (353/384)
]


async def translate_video(db, video_id: str, translation_svc: TranslationService) -> int:
    """Translate all untranslated subtitles for a video. Returns count translated."""
    result = await db.execute(
        select(Subtitle)
        .where(Subtitle.video_id == video_id, Subtitle.text_en.isnot(None), Subtitle.text_en != "")
        .order_by(Subtitle.sentence_index)
    )
    subs = list(result.scalars().all())
    if not subs:
        print(f"  [SKIP] No subtitles to translate for {video_id[:8]}", flush=True)
        return 0

    # Find untranslated
    untranslated = [(i, s) for i, s in enumerate(subs) if not s.text_zh]
    if not untranslated:
        print(f"  [SKIP] All {len(subs)} subtitles already translated for {video_id[:8]}", flush=True)
        return 0

    total = len(untranslated)
    print(f"  [TRANSLATE] {total} subtitles for {video_id[:8]}", flush=True)

    # GLM 200k context handles up to ~200 subtitles per batch well.
    # Larger videos are split into chunks to avoid timeouts/truncation.
    MAX_BATCH = 50  # 50 per batch — reliable for GLM
    count = 0
    for chunk_start in range(0, total, MAX_BATCH):
        chunk = untranslated[chunk_start : chunk_start + MAX_BATCH]
        texts = [s.text_en for _, s in chunk]
        chunk_len = len(texts)
        try:
            translated = await translation_svc.translate_batch(texts)
        except Exception as e:
            print(f"  [ERROR] Translation chunk failed at {chunk_start}: {e}", flush=True)
            continue

        chunk_count = 0
        for j, (_orig_idx, sub) in enumerate(chunk):
            if j < len(translated) and translated[j]:
                sub.text_zh = translated[j]
                count += 1
                chunk_count += 1

        await db.commit()
        done = min(chunk_start + MAX_BATCH, total)
        print(f"  [PROGRESS] {done}/{total} translated (chunk: {chunk_count}/{chunk_len})", flush=True)

    print(f"  [OK] Translated {count}/{total} for {video_id[:8]}", flush=True)
    return count


async def annotate_video(db, video_id: str) -> int:
    """Annotate word levels for all subtitles. Returns count annotated."""
    if not ecdict.is_available():
        print("  [SKIP] ECDICT not available")
        return 0

    result = await db.execute(select(Subtitle).where(Subtitle.video_id == video_id).order_by(Subtitle.sentence_index))
    subs = list(result.scalars().all())

    count = 0
    for s in subs:
        if not s.word_levels and s.text_en:
            levels = ecdict.annotate_text(s.text_en)
            if levels:
                s.word_levels = levels
                count += 1

    await db.commit()
    print(f"  [ANNOTATE] {count}/{len(subs)} annotated for {video_id[:8]}")
    return count


async def prewarm_video(db, video_id: str) -> None:
    """Prewarm AI word notes for a video."""
    try:
        import asyncio

        from app.services.word_notes import prewarm_video_notes

        # Run with a 5-minute timeout per video
        await asyncio.wait_for(prewarm_video_notes(db, video_id), timeout=300)
        print(f"  [PREWARM] Done for {video_id[:8]}", flush=True)
    except TimeoutError:
        print(f"  [PREWARM] Timed out (5min) for {video_id[:8]}", flush=True)
    except Exception as e:
        # Prewarm is non-blocking
        print(f"  [PREWARM] Skipped: {e}", flush=True)


async def main():
    settings = get_settings()
    print(f"Translation engine: {settings.translation_engine}")
    print(f"ECDICT available: {ecdict.is_available()}")
    print(f"Processing {len(VIDEO_IDS)} videos...\n")

    translation_svc = TranslationService()

    async with async_session() as db:
        for vid in VIDEO_IDS:
            print(f"\n{'=' * 60}", flush=True)
            # Get video info
            result = await db.execute(select(Video).where(Video.id == vid))
            video = result.scalar_one_or_none()
            if not video:
                print(f"[SKIP] Video {vid[:8]} not found", flush=True)
                continue

            title = (video.title or "")[:40]
            print(f"Processing: {title} ({vid[:8]})", flush=True)

            # Step 1: Translate
            await translate_video(db, vid, translation_svc)

            # Step 2: Annotate
            await annotate_video(db, vid)

            # Step 3: Prewarm (skip for now, too slow)
            # await prewarm_video(db, vid)
            print("  [PREWARM] Skipped", flush=True)

            # Step 4: Mark as ready (skip download/transcode for lightweight)
            video.status = VideoStatus.ready
            video.processing_step = None
            video.processing_progress = 100
            video.error_message = None
            await db.commit()
            print(f"  [DONE] Marked ready: {title}")

    print("\n\nAll videos processed!")


if __name__ == "__main__":
    asyncio.run(main())

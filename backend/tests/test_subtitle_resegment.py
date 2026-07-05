"""Tests for the bulk re-segment endpoint + rollback.

resegment: snapshots current subtitles, re-cuts into sentences via the same
split/merge pipeline the ingest path uses, drops translations (segmentation
changed). rollback: restores the snapshot row-for-row, including text_zh.
"""

import pytest
from httpx import AsyncClient

from app.models.subtitle import Subtitle
from app.models.subtitle_resegment_snapshot import SubtitleResegmentSnapshot
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal


async def _seed(subtitles: list[dict]) -> str:
    async with TestSessionLocal() as db:
        v = Video(
            title="Reseg",
            source_url="https://youtu.be/reseg",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
        )
        db.add(v)
        await db.flush()
        for i, s in enumerate(subtitles):
            db.add(
                Subtitle(
                    video_id=v.id,
                    start_time=s["start"],
                    end_time=s["end"],
                    text_en=s["text"],
                    text_zh=s.get("zh"),
                    sentence_index=i,
                    words=s.get("words"),
                )
            )
        await db.commit()
        return v.id


@pytest.mark.asyncio
async def test_resegment_splits_long_unsegmented_chunk(client: AsyncClient, admin_headers: dict):
    """A single 30s segment with sentence punctuation should be re-cut into
    multiple sentence-level segments."""
    vid = await _seed(
        [
            {
                "start": 0.0,
                "end": 30.0,
                "text": "Hello world. This is a test. Goodbye now.",
                "zh": "你好世界。这是一个测试。现在再见。",
                "words": [
                    {"word": "Hello", "start": 0.0, "end": 1.0},
                    {"word": "world.", "start": 1.0, "end": 2.0},
                    {"word": "This", "start": 2.0, "end": 3.0},
                    {"word": "is", "start": 3.0, "end": 4.0},
                    {"word": "a", "start": 4.0, "end": 5.0},
                    {"word": "test.", "start": 5.0, "end": 6.0},
                    {"word": "Goodbye", "start": 6.0, "end": 7.0},
                    {"word": "now.", "start": 7.0, "end": 8.0},
                ],
            }
        ]
    )
    resp = await client.post(f"/api/v1/videos/admin/{vid}/subtitles/resegment", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["before_count"] == 1
    assert data["after_count"] >= 3  # split into the 3 sentences
    assert data["translations_cleared"] is True

    # Translations cleared on the new rows.
    async with TestSessionLocal() as db:
        rows = (
            (
                await db.execute(
                    __import__("sqlalchemy")
                    .select(Subtitle)
                    .where(Subtitle.video_id == vid)
                    .order_by(Subtitle.sentence_index)
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == data["after_count"]
        assert all(r.text_zh is None for r in rows)
        # A snapshot was written.
        snaps = (await db.execute(__import__("sqlalchemy").select(SubtitleResegmentSnapshot))).scalars().all()
        assert len(snaps) == 1
        assert snaps[0].rolled_back is False


@pytest.mark.asyncio
async def test_resegment_works_without_words(client: AsyncClient, admin_headers: dict):
    """Legacy rows without word timestamps still re-cut (text + proportional
    fabricated timestamps)."""
    vid = await _seed(
        [
            {
                "start": 0.0,
                "end": 30.0,
                "text": "First sentence. Second sentence. Third one.",
                "zh": "第一句。第二句。第三句。",
            },
        ]
    )
    resp = await client.post(f"/api/v1/videos/admin/{vid}/subtitles/resegment", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["after_count"] >= 2


@pytest.mark.asyncio
async def test_rollback_restores_snapshot(client: AsyncClient, admin_headers: dict):
    """Rollback restores the original subtitles (text + translations) from the
    latest snapshot."""
    vid = await _seed(
        [
            {"start": 0.0, "end": 30.0, "text": "Hello world. Goodbye now.", "zh": "你好世界。现在再见。"},
        ]
    )
    # Re-segment (clears translations).
    resp = await client.post(f"/api/v1/videos/admin/{vid}/subtitles/resegment", headers=admin_headers)
    assert resp.status_code == 200
    # Roll back.
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/resegment/rollback",
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["restored_count"] == 1

    # Original row restored with its translation.
    async with TestSessionLocal() as db:
        rows = (
            (await db.execute(__import__("sqlalchemy").select(Subtitle).where(Subtitle.video_id == vid)))
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].text_en == "Hello world. Goodbye now."
        assert rows[0].text_zh == "你好世界。现在再见。"


@pytest.mark.asyncio
async def test_rollback_without_snapshot_rejected(client: AsyncClient, admin_headers: dict):
    vid = await _seed([{"start": 0.0, "end": 2.0, "text": "Hello."}])
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/resegment/rollback",
        headers=admin_headers,
    )
    assert resp.status_code == 400

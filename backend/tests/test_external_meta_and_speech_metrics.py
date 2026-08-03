"""Tests for external metadata parsing + subtitle speech metrics (阶段 1/3)."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.models.subtitle import Subtitle
from app.models.video import Video
from app.services.external_meta import apply_external_meta, parse_external_meta
from app.services.subtitle_metrics_service import (
    compute_speech_metrics,
    compute_video_speech_metrics,
)
from tests.conftest import TestSessionLocal

# ---------------------------------------------------------------------------
# parse_external_meta (pure)
# ---------------------------------------------------------------------------

_FULL_INFO = {
    "id": "dQw4w9WgXcQ",
    "title": "Test Video",
    "channel": "Test Channel",
    "channel_id": "UC1234567890",
    "channel_follower_count": 1_000_000,
    "channel_view_count": 500_000_000,
    "channel_is_verified": True,
    "upload_date": "20240315",
    "view_count": 1_200_000,
    "like_count": 96_000,
    "description": "a description",
    "tags": ["ai", "learning"],
    "categories": ["Education"],
    "language": "en",
    "subtitles": {"en": [{"ext": "vtt"}], "zh-Hans": [{"ext": "vtt"}]},
    "automatic_captions": {"en": [{"ext": "vtt"}]},
}


def test_parse_external_meta_full():
    parsed = parse_external_meta(_FULL_INFO)
    assert parsed["yt_video_id"] == "dQw4w9WgXcQ"
    assert parsed["channel_id"] == "UC1234567890"
    assert parsed["channel_name"] == "Test Channel"
    assert parsed["upload_date"] == datetime(2024, 3, 15, tzinfo=UTC)
    assert parsed["ext_view_count"] == 1_200_000
    assert parsed["ext_like_count"] == 96_000

    meta = parsed["external_meta"]
    assert meta["description"] == "a description"
    assert meta["tags"] == ["ai", "learning"]
    assert meta["categories"] == ["Education"]
    assert meta["language"] == "en"
    assert meta["channel"] == {
        "follower_count": 1_000_000,
        "total_view_count": 500_000_000,
        "is_verified": True,
    }
    caps = meta["captions"]
    assert caps["has_caption"] is True
    assert caps["manual_count"] == 2
    assert caps["auto_count"] == 1
    assert caps["has_manual_en"] is True
    assert "fetched_at" in meta


def test_parse_external_meta_partial():
    """Missing fields become None / empty — never raises."""
    parsed = parse_external_meta({"id": "abc", "uploader": "Uploader Name"})
    assert parsed["yt_video_id"] == "abc"
    assert parsed["channel_name"] == "Uploader Name"  # uploader fallback
    assert parsed["channel_id"] is None
    assert parsed["upload_date"] is None
    assert parsed["ext_view_count"] is None
    assert parsed["external_meta"]["captions"]["has_caption"] is False


def test_parse_upload_date_invalid():
    parsed = parse_external_meta({"upload_date": "2024-03-15"})  # wrong shape
    assert parsed["upload_date"] is None
    parsed = parse_external_meta({"upload_date": "20241340"})  # invalid month/day
    assert parsed["upload_date"] is None


# ---------------------------------------------------------------------------
# compute_speech_metrics (pure)
# ---------------------------------------------------------------------------


def test_speech_metrics_normal():
    rows = [
        ("Hello world hello", 0.0),
        ("This is a test", 4.0),
        ("Final line of speech", 60.0),
    ]
    wpm, density = compute_speech_metrics(rows)
    # 11 tokens over 1 minute → 11 WPM; 10 unique / 11 total.
    assert wpm == 11.0
    assert density == round(10 / 11, 4)


def test_speech_metrics_insufficient_lines():
    rows = [("Only one line", 5.0), ("", 6.0)]
    assert compute_speech_metrics(rows) == (None, None)


def test_speech_metrics_no_timeline():
    rows = [("aaa bbb", None), ("ccc ddd", 0.0), ("eee fff", None)]
    wpm, density = compute_speech_metrics(rows)
    assert wpm is None  # no positive end time → WPM impossible
    assert density == 1.0  # all unique


def test_speech_metrics_punctuation_ignored():
    rows = [("Don't stop!", 1.0), ("Don't stop.", 2.0), ("Believe me.", 60.0)]
    wpm, density = compute_speech_metrics(rows)
    # tokens: don't stop don't stop believe me → 6 tokens / 60s = 6 WPM
    assert wpm == 6.0
    assert density == round(4 / 6, 4)


# ---------------------------------------------------------------------------
# compute_video_speech_metrics (DB, compute-on-null)
# ---------------------------------------------------------------------------


async def _seed_video_with_subs(video_id: str, lines: list[tuple[str, float]]):
    async with TestSessionLocal() as db:
        db.add(Video(id=video_id, title="V", source_url="https://example.com/v"))
        for i, (text, end) in enumerate(lines):
            db.add(
                Subtitle(
                    video_id=video_id,
                    sentence_index=i,
                    start_time=max(0.0, end - 2.0),
                    end_time=end,
                    text_en=text,
                )
            )
        await db.commit()


async def test_video_speech_metrics_compute_on_null():
    await _seed_video_with_subs("vid-sm-1", [("one two three", 3.0), ("four five six", 6.0), ("seven eight", 60.0)])
    async with TestSessionLocal() as db:
        result = await compute_video_speech_metrics(db, "vid-sm-1")
    assert result is not None
    wpm, density = result
    assert wpm == 8.0  # 8 tokens / 1 minute
    assert density == 1.0

    # Persisted on the row.
    async with TestSessionLocal() as db:
        video = (await db.execute(select(Video).where(Video.id == "vid-sm-1"))).scalar_one()
        assert video.wpm == 8.0
        assert video.vocabulary_density == 1.0

    # Second call is a no-op (compute-on-null) even after subtitle changes.
    async with TestSessionLocal() as db:
        sub = (await db.execute(select(Subtitle).where(Subtitle.video_id == "vid-sm-1"))).scalars().first()
        sub.text_en = "totally different and much longer sentence now"
        await db.commit()
    async with TestSessionLocal() as db:
        assert await compute_video_speech_metrics(db, "vid-sm-1") == (8.0, 1.0)


async def test_video_speech_metrics_never_overwrites_manual():
    await _seed_video_with_subs("vid-sm-2", [("a b c", 3.0), ("d e f", 6.0), ("g h", 60.0)])
    async with TestSessionLocal() as db:
        video = (await db.execute(select(Video).where(Video.id == "vid-sm-2"))).scalar_one()
        video.wpm = 150.0  # manual value
        await db.commit()
    async with TestSessionLocal() as db:
        result = await compute_video_speech_metrics(db, "vid-sm-2")
    assert result == (150.0, 1.0)  # wpm kept, density computed


async def test_video_speech_metrics_insufficient_data():
    await _seed_video_with_subs("vid-sm-3", [("only one", 5.0)])
    async with TestSessionLocal() as db:
        assert await compute_video_speech_metrics(db, "vid-sm-3") is None
        assert await compute_video_speech_metrics(db, "missing-video") is None


# ---------------------------------------------------------------------------
# apply_external_meta writes all columns
# ---------------------------------------------------------------------------


async def test_apply_external_meta_to_video():
    async with TestSessionLocal() as db:
        video = Video(id="vid-ext-1", title="T", source_url="https://example.com/x")
        db.add(video)
        await db.commit()
        apply_external_meta(video, parse_external_meta(_FULL_INFO))
        await db.commit()

    async with TestSessionLocal() as db:
        video = (await db.execute(select(Video).where(Video.id == "vid-ext-1"))).scalar_one()
        assert video.yt_video_id == "dQw4w9WgXcQ"
        assert video.channel_name == "Test Channel"
        # SQLite returns naive datetimes; compare wall-clock only.
        assert video.upload_date is not None
        assert video.upload_date.replace(tzinfo=None) == datetime(2024, 3, 15)
        assert video.ext_view_count == 1_200_000
        assert video.ext_like_count == 96_000
        assert video.external_meta["language"] == "en"

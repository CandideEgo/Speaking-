"""Tests for the out-of-band backfill scripts.

They run outside the request path, so their contracts are easy to break and stay
invisible until the browse cache TTL expires or a value is lost:

- every write must invalidate the cached browse responses — including the
  single-video ``--video-id`` path, which used to return before that call;
- the dirty-difficulty cleanup and the subtitle fallback must look at the same
  videos, so a value nulled by cleanup is always eligible for a refill;
- the ``word_levels`` rewrite must leave every row canonical (the run's exit
  code is that check), and the census-only mode must write nothing at all.
"""

from __future__ import annotations

import json
import sys

import pytest
from sqlalchemy import select, text

from app.models.subtitle import Subtitle
from app.models.video import Video, VideoStatus
from scripts import backfill_classification, backfill_difficulty, backfill_word_levels
from tests.conftest import TestSessionLocal


def _point_at_test_db(monkeypatch, module) -> None:
    """Point the script's ``async_session`` at the test SQLite engine."""
    monkeypatch.setattr(module, "async_session", TestSessionLocal)


def _count_invalidations(monkeypatch) -> list[int]:
    """Replace ``invalidate_browse_cache`` with a counter. Returns the call list."""
    import app.services.video_cache as video_cache

    calls: list[int] = []

    async def _fake_invalidate() -> None:
        calls.append(1)

    monkeypatch.setattr(video_cache, "invalidate_browse_cache", _fake_invalidate)
    return calls


def _word_levels(basic: int, beyond: int) -> dict:
    """word_levels dict with ``basic`` 中考 words and ``beyond`` 高考 words."""
    out = {f"b{i}": ["zhongkao"] for i in range(basic)}
    out.update({f"x{i}": ["gaoKao"] for i in range(beyond)})
    return out


async def _make_video(
    db_session,
    *,
    status: VideoStatus = VideoStatus.ready,
    difficulty: str | None = None,
    topic_tags: str | None = None,
    word_levels: dict | None = None,
) -> str:
    v = Video(
        title="Backfill Test Video",
        source_url="https://www.youtube.com/watch?v=backfill_test",
        video_source="imported",
        status=status,
        difficulty_level=difficulty,
        topic_tags=topic_tags,
    )
    db_session.add(v)
    await db_session.flush()
    if word_levels is not None:
        db_session.add(
            Subtitle(
                video_id=v.id,
                start_time=0.0,
                end_time=3.0,
                text_en="Sentence 0",
                sentence_index=0,
                word_levels=word_levels,
            )
        )
    await db_session.commit()
    return v.id


async def _difficulty_of(db_session, video_id: str) -> str | None:
    video = await db_session.scalar(select(Video).where(Video.id == video_id))
    return video.difficulty_level


class TestClassificationCacheInvalidation:
    """scripts/backfill_classification.py must invalidate after every write."""

    @pytest.mark.asyncio
    async def test_video_id_run_invalidates(self, db_session, monkeypatch):
        _point_at_test_db(monkeypatch, backfill_classification)
        calls = _count_invalidations(monkeypatch)
        vid = await _make_video(db_session)

        async def _fake_classify(_db, video_id: str) -> bool:
            video = await _db.scalar(select(Video).where(Video.id == video_id))
            video.topic_tags = "ted"
            await _db.commit()
            return True

        monkeypatch.setattr(backfill_classification, "classify_video_metadata", _fake_classify)
        monkeypatch.setattr(sys, "argv", ["backfill_classification.py", "--video-id", vid])

        assert await backfill_classification.main() == 0
        assert calls == [1]

    @pytest.mark.asyncio
    async def test_video_id_dry_run_does_not_invalidate(self, db_session, monkeypatch):
        _point_at_test_db(monkeypatch, backfill_classification)
        calls = _count_invalidations(monkeypatch)
        vid = await _make_video(db_session)

        async def _fake_classify(_db, _video):
            return {"topics": ["ted"], "difficulty": "B1"}

        monkeypatch.setattr(backfill_classification, "classify_video", _fake_classify)
        monkeypatch.setattr(sys, "argv", ["backfill_classification.py", "--video-id", vid, "--dry-run"])

        assert await backfill_classification.main() == 0
        assert calls == []

    @pytest.mark.asyncio
    async def test_video_id_already_classified_does_not_invalidate(self, db_session, monkeypatch):
        """A skip wrote nothing, so the cache is still valid."""
        _point_at_test_db(monkeypatch, backfill_classification)
        calls = _count_invalidations(monkeypatch)
        vid = await _make_video(db_session, topic_tags="ted")
        monkeypatch.setattr(sys, "argv", ["backfill_classification.py", "--video-id", vid])

        assert await backfill_classification.main() == 0
        assert calls == []


class TestDifficultyCacheInvalidation:
    """scripts/backfill_difficulty.py must invalidate after every write."""

    @pytest.mark.asyncio
    async def test_video_id_run_invalidates(self, db_session, monkeypatch):
        _point_at_test_db(monkeypatch, backfill_difficulty)
        calls = _count_invalidations(monkeypatch)
        vid = await _make_video(db_session, word_levels=_word_levels(70, 30))
        monkeypatch.setattr(sys, "argv", ["backfill_difficulty.py", "--video-id", vid])

        assert await backfill_difficulty.main() == 0
        assert await _difficulty_of(db_session, vid) == "B2"
        assert calls == [1]

    @pytest.mark.asyncio
    async def test_video_id_skip_does_not_invalidate(self, db_session, monkeypatch):
        """An already-leveled video returns its level but writes nothing."""
        _point_at_test_db(monkeypatch, backfill_difficulty)
        calls = _count_invalidations(monkeypatch)
        vid = await _make_video(db_session, difficulty="C1", word_levels=_word_levels(70, 30))
        monkeypatch.setattr(sys, "argv", ["backfill_difficulty.py", "--video-id", vid])

        assert await backfill_difficulty.main() == 0
        assert await _difficulty_of(db_session, vid) == "C1"
        assert calls == []


class TestDirtyDifficultyScope:
    """Cleanup and refill must cover the same videos (see DEC-043 backfill)."""

    @pytest.mark.asyncio
    async def test_clean_leaves_processing_videos_alone(self, db_session, monkeypatch):
        """A dirty value on a still-processing video is reported, not cleared.

        Clearing it would leave the video with no level until a later run; the
        value is not shown anywhere before the video is ready.
        """
        _point_at_test_db(monkeypatch, backfill_classification)
        ready = await _make_video(db_session, difficulty="CR")
        processing = await _make_video(db_session, status=VideoStatus.processing, difficulty="CR")

        cleaned, deferred = await backfill_classification.clean_dirty_difficulty(dry_run=False)

        assert (cleaned, deferred) == (1, 1)
        assert await _difficulty_of(db_session, ready) is None
        assert await _difficulty_of(db_session, processing) == "CR"

    @pytest.mark.asyncio
    async def test_cleaned_value_is_refilled_in_the_same_run(self, db_session, monkeypatch):
        """Cleanup scope ⊆ refill scope: nothing is cleared without a refill path."""
        _point_at_test_db(monkeypatch, backfill_classification)
        vid = await _make_video(db_session, difficulty="CR", word_levels=_word_levels(70, 30))

        cleaned, _deferred = await backfill_classification.clean_dirty_difficulty(dry_run=False)
        filled = await backfill_classification.fill_missing_difficulty(dry_run=False)

        assert (cleaned, filled) == (1, 1)
        assert await _difficulty_of(db_session, vid) == "B2"


class TestWordLevelsBackfill:
    """scripts/backfill_word_levels.py — census, rewrite, and JSON-null repair.

    The rows it has to fix can no longer be created through the ORM (that is the
    point of the column type), so they are planted with raw SQL — which is also
    how the script reads them back.
    """

    @staticmethod
    async def _plant(db_session, payload: str) -> str:
        """Insert a subtitle and write ``payload`` straight into the column."""
        vid = await _make_video(db_session)  # no subtitles: _make_video skips them
        sub = Subtitle(video_id=vid, start_time=0.0, end_time=3.0, text_en="Sentence", sentence_index=1)
        db_session.add(sub)
        await db_session.commit()
        await db_session.execute(
            text("UPDATE subtitles SET word_levels = :payload WHERE id = :id"),
            {"payload": payload, "id": sub.id},
        )
        await db_session.commit()
        return sub.id

    @staticmethod
    async def _raw(db_session, sub_id: str) -> str | None:
        return (
            await db_session.execute(text("SELECT word_levels FROM subtitles WHERE id = :id"), {"id": sub_id})
        ).scalar_one()

    def test_summarize_counts_legacy_entries_and_json_nulls(self):
        reviewed, non_array, shapes = backfill_word_levels.summarize(
            [
                ("s1", {"fox": ["cet4"]}),  # canonical
                ("s2", {"fox": "cet4"}),  # the legacy str shape
                ("s3", {"fox": [], "cat": ["cet6"]}),  # empty entry, still an array
                ("s4", None),  # JSON null left by an empty annotation set
            ]
        )
        assert reviewed == 4
        assert non_array == 2
        assert (shapes["list"], shapes["str"], shapes["null"]) == (3, 1, 1)

    @pytest.mark.asyncio
    async def test_apply_rewrites_the_legacy_str_shape(self, db_session, monkeypatch):
        _point_at_test_db(monkeypatch, backfill_word_levels)
        sub_id = await self._plant(db_session, json.dumps({"fox": "cet4", "cat": ["cet6"]}))

        # Exit 0 is this batch's acceptance check: the script re-runs the census
        # after committing and fails the run if anything is still non-canonical.
        assert await backfill_word_levels.main(apply=True) == 0
        assert json.loads(await self._raw(db_session, sub_id)) == {"fox": ["cet4"], "cat": ["cet6"]}

    @pytest.mark.asyncio
    async def test_apply_repairs_a_json_null_to_sql_null(self, db_session, monkeypatch):
        """An empty annotation set used to land as a JSON null *value*, which
        ``IS NOT NULL`` counts as annotated and ``jsonb_each`` rejects."""
        _point_at_test_db(monkeypatch, backfill_word_levels)
        sub_id = await self._plant(db_session, "null")

        assert await backfill_word_levels.main(apply=True) == 0
        assert await self._raw(db_session, sub_id) is None

    @pytest.mark.asyncio
    async def test_census_only_writes_nothing(self, db_session, monkeypatch):
        _point_at_test_db(monkeypatch, backfill_word_levels)
        sub_id = await self._plant(db_session, json.dumps({"fox": "cet4"}))

        assert await backfill_word_levels.main(apply=False) == 0
        assert json.loads(await self._raw(db_session, sub_id)) == {"fox": "cet4"}

    @pytest.mark.asyncio
    async def test_a_canonical_row_is_left_alone(self, db_session, monkeypatch):
        _point_at_test_db(monkeypatch, backfill_word_levels)
        payload = json.dumps({"fox": ["cet4"], "cat": ["cet6"]})
        sub_id = await self._plant(db_session, payload)

        assert await backfill_word_levels.main(apply=True) == 0
        assert json.loads(await self._raw(db_session, sub_id)) == json.loads(payload)

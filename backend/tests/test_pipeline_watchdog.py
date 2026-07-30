"""Tests for the full-pipeline watchdog (阶段 1).

Covers the rewritten ``watchdog_stale_pipeline`` that detects stuck steps in
both the head (``processing``) and tail (``ready_subtitles``) phases, with
per-step timeouts and Redis-lock-aware skip (Celery retry backoff protection).
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.video import Video, VideoStatus
from tests.conftest import TestSessionLocal


async def _patch_async_session(monkeypatch):
    """Point app.core.database.async_session at the test SQLite engine.

    The watchdog imports ``async_session`` at call time, so patching the module
    attribute makes its ``async with async_session() as db`` use the in-memory
    test engine (the same one ``db_session`` writes to).
    """
    import app.core.database as db_mod

    monkeypatch.setattr(db_mod, "async_session", TestSessionLocal)


class TestWatchdogStalePipeline:
    @pytest.mark.asyncio
    async def test_stuck_tail_step_marked_error(self, db_session, monkeypatch):
        """A ready_subtitles video stuck in translating is marked error."""
        await _patch_async_session(monkeypatch)
        from app.tasks.video_processing import _run_watchdog_pipeline

        v = Video(
            title="stuck tail",
            source_url="x",
            status=VideoStatus.ready_subtitles,
            processing_step="translating",
            step_started_at=datetime.now(UTC) - timedelta(hours=2),
            processing_progress=70,
        )
        db_session.add(v)
        await db_session.commit()
        vid = v.id

        await _run_watchdog_pipeline()

        async with TestSessionLocal() as db:
            fetched = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert fetched.status == VideoStatus.error
            assert "translating" in (fetched.error_message or "")
            assert fetched.processing_step is None
            assert fetched.step_started_at is None

    @pytest.mark.asyncio
    async def test_within_budget_not_marked(self, db_session, monkeypatch):
        """A video whose step_started_at is recent is not touched."""
        await _patch_async_session(monkeypatch)
        from app.tasks.video_processing import _run_watchdog_pipeline

        v = Video(
            title="fresh",
            source_url="x",
            status=VideoStatus.ready_subtitles,
            processing_step="translating",
            step_started_at=datetime.now(UTC) - timedelta(seconds=10),
            processing_progress=70,
        )
        db_session.add(v)
        await db_session.commit()
        vid = v.id

        await _run_watchdog_pipeline()

        async with TestSessionLocal() as db:
            fetched = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert fetched.status == VideoStatus.ready_subtitles

    @pytest.mark.asyncio
    async def test_lock_held_skips(self, db_session, monkeypatch):
        """A stuck video whose lock is held (worker in retry backoff) is skipped."""
        await _patch_async_session(monkeypatch)
        import app.tasks.pipeline_helpers as ph

        monkeypatch.setattr(ph, "is_lock_held", lambda vid: True)
        from app.tasks.video_processing import _run_watchdog_pipeline

        v = Video(
            title="retrying",
            source_url="x",
            status=VideoStatus.ready_subtitles,
            processing_step="translating",
            step_started_at=datetime.now(UTC) - timedelta(hours=2),
            processing_progress=70,
        )
        db_session.add(v)
        await db_session.commit()
        vid = v.id

        await _run_watchdog_pipeline()

        async with TestSessionLocal() as db:
            fetched = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert fetched.status == VideoStatus.ready_subtitles  # not killed

    @pytest.mark.asyncio
    async def test_legacy_null_step_started_at_transcribing(self, db_session, monkeypatch):
        """Legacy row with NULL step_started_at falls back to processing_started_at."""
        await _patch_async_session(monkeypatch)
        from app.tasks.video_processing import _run_watchdog_pipeline

        v = Video(
            title="legacy",
            source_url="x",
            status=VideoStatus.processing,
            processing_step="transcribing",
            step_started_at=None,
            processing_started_at=datetime.now(UTC) - timedelta(hours=3),
            processing_progress=30,
        )
        db_session.add(v)
        await db_session.commit()
        vid = v.id

        await _run_watchdog_pipeline()

        async with TestSessionLocal() as db:
            fetched = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert fetched.status == VideoStatus.error

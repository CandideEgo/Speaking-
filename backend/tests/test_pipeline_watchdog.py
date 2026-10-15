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

    @pytest.mark.asyncio
    async def test_classifying_uses_its_own_budget(self, db_session, monkeypatch):
        """A video stuck in classifying is failed on the step budget, not the 1h default.

        15 minutes is past pipeline_step_timeout_classifying (600s) but well
        inside pipeline_step_timeout_default (3600s), so this only passes when
        the step actually has an entry in the budget map.
        """
        await _patch_async_session(monkeypatch)
        from app.tasks.video_processing import _run_watchdog_pipeline

        v = Video(
            title="stuck classifying",
            source_url="x",
            status=VideoStatus.ready_subtitles,
            processing_step="classifying",
            step_started_at=datetime.now(UTC) - timedelta(minutes=15),
            processing_progress=74,
        )
        db_session.add(v)
        await db_session.commit()
        vid = v.id

        await _run_watchdog_pipeline()

        async with TestSessionLocal() as db:
            fetched = (await db.execute(select(Video).where(Video.id == vid))).scalar_one()
            assert fetched.status == VideoStatus.error
            assert "classifying" in (fetched.error_message or "")


class TestStepBudgets:
    """INV: every pipeline step declares its own watchdog budget."""

    def test_every_pipeline_step_has_a_budget(self):
        """A step without a budget inherits the 1h default.

        That is a silent hour of latency before a hung step is detected. 批 3a
        turned this from a convention into a structural property: the budget
        *is* a ``Step`` field, so a step cannot join ``STEPS`` without either
        naming a settings attr or being declared terminal.
        """
        from app.tasks.pipeline_helpers import STEPS, TERMINAL_STEP

        missing = [step.name for step in STEPS if step.name != TERMINAL_STEP and not step.timeout_attr]
        assert missing == [], f"steps with no watchdog budget (they fall back to the default): {missing}"

    def test_budgets_are_positive(self):
        """A zero/negative budget would fail every in-flight video immediately."""
        from app.tasks.pipeline_helpers import get_step_timeouts

        assert all(seconds > 0 for seconds in get_step_timeouts().values())

    def test_progress_map_covers_every_declared_step(self):
        """``STEP_PROGRESS`` is a view of ``STEPS``, so this also catches a step
        added to the progress map by hand while ``STEPS`` was left alone."""
        from app.tasks.pipeline_helpers import STEP_PROGRESS, STEPS

        assert set(STEP_PROGRESS) == {step.name for step in STEPS}

    def test_declared_order_is_the_order_finalize_runs_them(self):
        """The declaration is only useful if it matches the code that runs it.

        批 3a declared pipeline order in ``STEPS``, but the tail's real order
        lived in ``finalize_video``'s if-sequence — back then this check read
        that sequence out of the AST. 批 3b moved the bodies into ``Step.run``,
        so there is no sequence left to read and it asks the assembled tuple
        instead: the tail's steps come off ``STEPS`` by name, in ``STEPS``
        order, and the literal below names them.

        The tail is the declared suffix from ``translating`` on — ``extracting``
        and ``transcribing`` belong to the head/GPU tasks — which is now the
        whole of what ``finalize_video`` does.

        What the two asserts catch, in order: a body dropped from
        ``_TAIL_BODIES`` (the step would silently never run again — the literal
        names every one of them), and a step inserted into the declaration in
        the wrong place (the tail would run it out of order).  A downstream step
        finding missing input at 3am is what this is for.
        """
        from app.tasks.pipeline_helpers import STEPS, TERMINAL_STEP
        from app.tasks.video_processing import finalize_steps

        steps = finalize_steps()
        executed = [step.name for step in steps]
        assert executed == [
            "translating",
            "annotating",
            "prewarm_notes",
            "classifying",
            "downloading",
            "transcoding",
            TERMINAL_STEP,
        ]
        declared = [step.name for step in STEPS if step.name in set(executed)]
        assert declared == executed
        assert all(step.run is not None for step in steps)
        by_name = {step.name: step for step in steps}
        assert by_name["downloading"].skip_run is not None, "续跑跳过 downloading 时仍要把 raw 文件路径交给 transcoding"

"""管线派发 outbox（A05/BE-01）的行为测试。

审计复现的缺口是「DB 已提交、broker 没收到」：回调先写 ``ready_subtitles`` 再
``delay()``，broker 抖动或进程在两步之间被杀，tail 就永远不跑，而回调的后续重试
会被状态守卫当成重复回调直接 acknowledged。这里钉住修复后的契约：

1. 意图与状态在**同一事务**落库（``enqueue`` 不提交，由调用方提交）；
2. 立即派发失败不丢意图：行留在 pending，带退避，视频状态保持可恢复；
3. 重复入队只命中同一行（``(video_id, task_name)`` 唯一），不会排两遍；
4. 视频已经离开该任务适用的状态时，意图标 abandoned 而不是白跑 GPU/LLM；
5. beat 扫描补发到期的行、跳过仍在退避的行、清理已落定的旧行；
6. 有未投递意图的视频不会被看门狗判死（``pending_video_ids``）。
"""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models.pipeline_dispatch import (
    DISPATCH_STATUS_ABANDONED,
    DISPATCH_STATUS_DISPATCHED,
    DISPATCH_STATUS_PENDING,
    PipelineDispatch,
)
from app.models.video import Video, VideoSource, VideoStatus
from app.services import pipeline_dispatch as dispatch_mod
from app.services.pipeline_dispatch import (
    FINALIZE_VIDEO_TASK,
    backlog,
    dispatch_now,
    dispatch_pending,
    enqueue,
    pending_video_ids,
    prune_settled,
)
from app.tasks.celery_app import GPU_TRANSCRIBE_TASK
from tests.conftest import TestSessionLocal

pytestmark = pytest.mark.unit


async def _seed_video(status: VideoStatus = VideoStatus.ready_subtitles) -> str:
    video_id = str(uuid.uuid4())
    async with TestSessionLocal() as db:
        db.add(
            Video(
                id=video_id,
                title="Dispatch fixture",
                source_url="https://example.com/dispatch-fixture.mp4",
                video_source=VideoSource.imported,
                status=status,
            )
        )
        await db.commit()
    return video_id


async def _rows(video_id: str) -> list[PipelineDispatch]:
    async with TestSessionLocal() as db:
        result = await db.execute(select(PipelineDispatch).where(PipelineDispatch.video_id == video_id))
        return list(result.scalars().all())


@pytest.fixture
def sent(monkeypatch) -> list[tuple[str, list, str | None]]:
    """Replace the broker seam with a recorder; `fail_times` makes it raise."""
    calls: list[tuple[str, list, str | None]] = []

    def _fake_send(task_name: str, args: list, queue: str | None) -> None:
        calls.append((task_name, list(args), queue))

    monkeypatch.setattr(dispatch_mod, "_send_task", _fake_send)
    return calls


@pytest.fixture
def no_backoff(monkeypatch) -> None:
    """Make retries due immediately so a sweep can be observed in one test."""
    monkeypatch.setattr(dispatch_mod, "_backoff_seconds", lambda attempts: 0)


class TestEnqueue:
    async def test_enqueue_is_transactional_and_does_not_send(self, db_session, sent):
        video_id = await _seed_video()

        row_id = await enqueue(db_session, video_id=video_id, task_name=FINALIZE_VIDEO_TASK, args=[video_id])
        await db_session.commit()

        assert sent == []
        rows = await _rows(video_id)
        assert len(rows) == 1
        assert rows[0].id == row_id
        assert rows[0].status == DISPATCH_STATUS_PENDING
        assert rows[0].args == [video_id]
        assert rows[0].attempts == 0

    async def test_repeat_enqueue_rearms_the_same_row(self, db_session, sent):
        video_id = await _seed_video()

        first = await enqueue(db_session, video_id=video_id, task_name=FINALIZE_VIDEO_TASK, args=[video_id])
        await db_session.commit()
        # A duplicate caller arrives after the first intent was already sent.
        await dispatch_now(db_session, first)
        second = await enqueue(db_session, video_id=video_id, task_name=FINALIZE_VIDEO_TASK, args=[video_id])
        await db_session.commit()

        assert second == first
        rows = await _rows(video_id)
        assert len(rows) == 1
        assert rows[0].status == DISPATCH_STATUS_PENDING
        assert rows[0].dispatched_at is None


class TestDispatchNow:
    async def test_successful_send_marks_dispatched(self, db_session, sent):
        video_id = await _seed_video()

        row_id = await enqueue(db_session, video_id=video_id, task_name=FINALIZE_VIDEO_TASK, args=[video_id])
        await db_session.commit()
        assert await dispatch_now(db_session, row_id) is True

        assert sent == [(FINALIZE_VIDEO_TASK, [video_id], None)]
        row = (await _rows(video_id))[0]
        assert row.status == DISPATCH_STATUS_DISPATCHED
        assert row.attempts == 1
        assert row.dispatched_at is not None
        assert row.last_error is None

    async def test_send_failure_keeps_the_intent_with_backoff(self, db_session, monkeypatch):
        video_id = await _seed_video()

        def _broken_send(task_name: str, args: list, queue: str | None) -> None:
            raise ConnectionError("broker down")

        monkeypatch.setattr(dispatch_mod, "_send_task", _broken_send)
        row_id = await enqueue(db_session, video_id=video_id, task_name=FINALIZE_VIDEO_TASK, args=[video_id])
        await db_session.commit()

        assert await dispatch_now(db_session, row_id) is False

        row = (await _rows(video_id))[0]
        assert row.status == DISPATCH_STATUS_PENDING
        assert row.attempts == 1
        assert "broker down" in (row.last_error or "")
        assert row.next_attempt_at is not None
        # The video keeps its pre-tail state: nothing about the failure is terminal.
        async with TestSessionLocal() as db:
            status = await db.scalar(select(Video.status).where(Video.id == video_id))
        assert status == VideoStatus.ready_subtitles

    async def test_video_that_moved_on_is_abandoned_not_sent(self, db_session, sent):
        video_id = await _seed_video(status=VideoStatus.error)

        row_id = await enqueue(db_session, video_id=video_id, task_name=FINALIZE_VIDEO_TASK, args=[video_id])
        await db_session.commit()

        assert await dispatch_now(db_session, row_id) is False
        assert sent == []
        row = (await _rows(video_id))[0]
        assert row.status == DISPATCH_STATUS_ABANDONED
        assert "error" in (row.last_error or "")

    async def test_gpu_intent_requires_processing_status(self, db_session, sent):
        ready_id = await _seed_video(status=VideoStatus.ready)
        processing_id = await _seed_video(status=VideoStatus.processing)

        abandoned = await enqueue(
            db_session, video_id=ready_id, task_name=GPU_TRANSCRIBE_TASK, args=[ready_id, "s", "x"]
        )
        delivered = await enqueue(
            db_session,
            video_id=processing_id,
            task_name=GPU_TRANSCRIBE_TASK,
            args=[processing_id, "s", "x"],
            queue="transcription_gpu",
        )
        await db_session.commit()

        assert await dispatch_now(db_session, abandoned) is False
        assert await dispatch_now(db_session, delivered) is True
        assert sent == [(GPU_TRANSCRIBE_TASK, [processing_id, "s", "x"], "transcription_gpu")]


class TestDispatchPending:
    async def test_sweep_sends_due_rows_and_skips_backoff(self, db_session, monkeypatch, no_backoff):
        due_id = await _seed_video()
        waiting_id = await _seed_video()
        due_row = await enqueue(db_session, video_id=due_id, task_name=FINALIZE_VIDEO_TASK, args=[due_id])
        waiting_row = await enqueue(db_session, video_id=waiting_id, task_name=FINALIZE_VIDEO_TASK, args=[waiting_id])
        await db_session.commit()

        calls: list[tuple[str, list, str | None]] = []

        def _ok_send(task_name: str, args: list, queue: str | None) -> None:
            calls.append((task_name, list(args), queue))

        monkeypatch.setattr(dispatch_mod, "_send_task", _ok_send)

        # One intent is inside its retry window — the sweep must leave it alone.
        async with TestSessionLocal() as db:
            waiting = await db.get(PipelineDispatch, waiting_row)
            assert waiting is not None
            waiting.next_attempt_at = datetime.now(UTC) + timedelta(minutes=5)
            await db.commit()

        sweep = await dispatch_pending(db_session)

        assert sweep.sent == 1
        assert sweep.failed == 0
        assert calls == [(FINALIZE_VIDEO_TASK, [due_id], None)]
        async with TestSessionLocal() as db:
            due_after = await db.get(PipelineDispatch, due_row)
            waiting_after = await db.get(PipelineDispatch, waiting_row)
            assert due_after is not None and due_after.status == DISPATCH_STATUS_DISPATCHED
            assert waiting_after is not None and waiting_after.status == DISPATCH_STATUS_PENDING

    async def test_prune_removes_only_settled_old_rows(self, db_session, sent):
        video_id = await _seed_video()
        row_id = await enqueue(db_session, video_id=video_id, task_name=FINALIZE_VIDEO_TASK, args=[video_id])
        await db_session.commit()
        await dispatch_now(db_session, row_id)

        assert await prune_settled(db_session, retention_hours=72) == 0
        async with TestSessionLocal() as db:
            row = await db.get(PipelineDispatch, row_id)
            assert row is not None
            row.updated_at = datetime.now(UTC) - timedelta(days=4)
            await db.commit()

        assert await prune_settled(db_session, retention_hours=72) == 1
        assert await _rows(video_id) == []

    async def test_second_sweep_does_not_resend(self, db_session, sent):
        video_id = await _seed_video()
        await enqueue(db_session, video_id=video_id, task_name=FINALIZE_VIDEO_TASK, args=[video_id])
        await db_session.commit()

        first = await dispatch_pending(db_session)
        second = await dispatch_pending(db_session)

        assert first.sent == 1
        assert second.sent == 0
        assert second.scanned == 0
        assert sent == [(FINALIZE_VIDEO_TASK, [video_id], None)]


class TestBacklog:
    async def test_backlog_counts_pending_and_oldest_age(self, db_session, sent):
        video_id = await _seed_video()
        await enqueue(db_session, video_id=video_id, task_name=FINALIZE_VIDEO_TASK, args=[video_id])
        await db_session.commit()

        async with TestSessionLocal() as db:
            row = (await db.execute(select(PipelineDispatch))).scalars().one()
            row.created_at = datetime.now(UTC) - timedelta(hours=1)
            await db.commit()

        state = await backlog(db_session)
        assert state.pending == 1
        assert state.oldest_age_seconds is not None and state.oldest_age_seconds >= 3600

    async def test_no_pending_means_no_backlog(self, db_session):
        state = await backlog(db_session)
        assert state.pending == 0
        assert state.oldest_age_seconds is None


class TestPendingVideoIds:
    async def test_pending_rows_protect_their_videos(self, db_session, sent):
        pending_id = await _seed_video()
        dispatched_id = await _seed_video()
        await enqueue(db_session, video_id=pending_id, task_name=FINALIZE_VIDEO_TASK, args=[pending_id])
        delivered = await enqueue(
            db_session, video_id=dispatched_id, task_name=FINALIZE_VIDEO_TASK, args=[dispatched_id]
        )
        await db_session.commit()
        await dispatch_now(db_session, delivered)

        protected = await pending_video_ids(db_session, [pending_id, dispatched_id])
        assert protected == {pending_id}
        assert await pending_video_ids(db_session, []) == set()

    async def test_no_rows_for_video(self, db_session):
        assert await pending_video_ids(db_session, [str(uuid.uuid4())]) == set()
        async with TestSessionLocal() as db:
            assert await db.scalar(select(func.count()).select_from(PipelineDispatch)) == 0


class TestImportOrder:
    def test_service_imports_before_the_celery_app(self):
        """The service must not depend on celery_app being imported first.

        ``app.services.pipeline_dispatch`` imports the Celery instance for the
        GPU task name, so ``dispatch_pipeline_tasks`` has to import the service
        lazily — otherwise ``celery_app``'s bottom-of-file import closes a cycle
        that only bites entry points importing the service directly (scripts,
        one-off drills). The in-process suite can't catch this: conftest loads
        the app (and therefore celery_app) before any test module.
        """
        backend_dir = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            [sys.executable, "-c", "import app.services.pipeline_dispatch"],
            cwd=backend_dir,
            capture_output=True,
            text=True,
            timeout=60,
            env={**os.environ, "PYTHONUTF8": "1"},
        )
        assert result.returncode == 0, result.stderr

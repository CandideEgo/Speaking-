"""A05 broker-outage drill: pending intent survives a dead broker and the
beat sweep delivers it once the broker is back.

Run twice in fresh processes (settings cache is per-process):

    phase A: REDIS_URL=redis://127.0.0.1:6399/0  (nothing listening)
    phase B: REDIS_URL=redis://127.0.0.1:6391/0  (disposable redis, started in between)

DATABASE_URL points at a throwaway Postgres database.

Run from ``backend/`` so ``app`` is importable, e.g.:

    PHASE=A PYTHONUTF8=1 PYTHONPATH=.. DATABASE_URL=... REDIS_URL=redis://127.0.0.1:6399/0 \
        .venv/Scripts/python.exe ../docs/evidence/iteration-2/broker-outage-drill.py

Results of the 2026-10-30 run: [verification-2026-10-30.md](verification-2026-10-30.md).
"""

import asyncio
import os
import sys
import uuid

from sqlalchemy import select

import app.models  # noqa: F401  (fill Base.metadata)
from app.core.database import Base, get_async_session_maker
from app.models.pipeline_dispatch import PipelineDispatch
from app.models.video import Video, VideoSource, VideoStatus
from app.services.pipeline_dispatch import dispatch_now, dispatch_pending, enqueue
from app.tasks.celery_app import GPU_TRANSCRIBE_TASK, celery_app


async def phase_a() -> int:
    async with get_async_session_maker()() as db:
        conn = await db.connection()
        await conn.run_sync(Base.metadata.create_all)
        await db.commit()

        video_id = str(uuid.uuid4())
        db.add(
            Video(
                id=video_id,
                title="broker-outage drill",
                source_url="https://example.com/drill.mp4",
                video_source=VideoSource.imported,
                status=VideoStatus.processing,
            )
        )
        await db.flush()

        dispatch_id = await enqueue(db, video_id=video_id, task_name=GPU_TRANSCRIBE_TASK, args=[video_id, "x", "y"])
        await db.commit()
        print(f"enqueued dispatch {dispatch_id} for video {video_id}")

        sent = await dispatch_now(db, dispatch_id)
        row = await db.get(PipelineDispatch, dispatch_id)
        print(f"dispatch_now -> {sent}; status={row.status} attempts={row.attempts} last_error={row.last_error!r}")
        print(f"next_attempt_at={row.next_attempt_at}")
        ok = (not sent) and row.status == "pending" and row.attempts >= 1 and row.last_error
        print(f"VIDEO_ID={video_id}")
        return 0 if ok else 2


async def phase_b() -> int:
    async with get_async_session_maker()() as db:
        sweep = await dispatch_pending(db)
        print(f"sweep: scanned={sweep.scanned} sent={sweep.sent} failed={sweep.failed} abandoned={sweep.abandoned}")
        rows = (await db.execute(select(PipelineDispatch))).scalars().all()
        for row in rows:
            print(f"row {row.task_name}: status={row.status} attempts={row.attempts} last_error={row.last_error!r}")
        ok = sweep.sent == 1 and all(row.status == "dispatched" for row in rows)
        return 0 if ok else 2


async def main() -> int:
    print(f"broker={celery_app.conf.broker_url}")
    return await (phase_a() if os.environ.get("PHASE") == "A" else phase_b())


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

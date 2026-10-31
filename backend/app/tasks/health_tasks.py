"""Worker/beat process heartbeats (A09/OPS-05).

A health alert about "the worker died" cannot be produced by the worker, and a
beat-scheduled check cannot run when the worker is the thing that died. So the
processes that must be observed only *write* heartbeats here; the web process
reads them (``app/services/health_monitor.py``) and raises alerts.

The writer is a daemon thread, not a task: a long transcription tail can keep
every task slot busy for 30 minutes, and a task-based heartbeat would then look
exactly like a dead worker. ``worker_ready`` fires once per worker process;
``beat_init`` fires in the scheduler process.

The GPU worker has its own heartbeat (``gpu_worker/contracts.py``), written by
``gpu-worker/scripts/start_gpu_worker.py`` — this module never touches it.
"""

from __future__ import annotations

import threading

from celery.signals import beat_init, worker_ready, worker_shutdown

from app.core.heartbeat import (
    BEAT_HEARTBEAT_INTERVAL_SECONDS,
    BEAT_HEARTBEAT_KEY,
    BEAT_HEARTBEAT_TTL_SECONDS,
    WORKER_HEARTBEAT_INTERVAL_SECONDS,
    WORKER_HEARTBEAT_KEY,
    WORKER_HEARTBEAT_TTL_SECONDS,
    touch,
)
from app.core.logging import get_logger

logger = get_logger(__name__)

_stop = threading.Event()
_started_lock = threading.Lock()
_threads: list[threading.Thread] = []
_started_keys: set[str] = set()


def _beat_loop(key: str, ttl_seconds: int, interval_seconds: int) -> None:
    from app.tasks.pipeline_helpers import get_pipeline_redis

    client = get_pipeline_redis()
    while not _stop.is_set():
        try:
            touch(client, key, ttl_seconds)
        except Exception:
            # A Redis outage is precisely when the monitor must stay able to
            # see staleness — log and keep trying, never die.
            logger.warning("heartbeat write failed", key=key, exc_info=True)
        _stop.wait(interval_seconds)


def _start(key: str, ttl_seconds: int, interval_seconds: int, name: str) -> None:
    # Keyed, not one-thread-only: ``celery worker -B`` runs the beat scheduler
    # inside the worker process, so both signals can fire here. Separate
    # processes (production) simply start one each.
    with _started_lock:
        if key in _started_keys:
            return
        _started_keys.add(key)
        thread = threading.Thread(
            target=_beat_loop,
            args=(key, ttl_seconds, interval_seconds),
            name=name,
            daemon=True,
        )
        thread.start()
        _threads.append(thread)
    logger.info("heartbeat thread started", key=key, interval=interval_seconds)


@worker_ready.connect
def _on_worker_ready(**_kwargs) -> None:
    _start(
        WORKER_HEARTBEAT_KEY,
        WORKER_HEARTBEAT_TTL_SECONDS,
        WORKER_HEARTBEAT_INTERVAL_SECONDS,
        "cloud-worker-heartbeat",
    )


@beat_init.connect
def _on_beat_init(**_kwargs) -> None:
    _start(
        BEAT_HEARTBEAT_KEY,
        BEAT_HEARTBEAT_TTL_SECONDS,
        BEAT_HEARTBEAT_INTERVAL_SECONDS,
        "beat-heartbeat",
    )


@worker_shutdown.connect
def _on_worker_shutdown(**_kwargs) -> None:
    _stop.set()

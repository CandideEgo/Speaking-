"""Liveness heartbeat keys shared by workers, beat and the health monitor (A09).

Each long-lived Celery process writes its own key with a TTL; the web-process
monitor reads them and alerts when one goes stale. A stale key is the only
signal that survives the process dying — no HTTP port, no in-process flag.

The GPU worker keeps its own key in ``gpu_worker/contracts.py``
(``worker:gpu:heartbeat``); it is written by
``gpu-worker/scripts/start_gpu_worker.py`` and read here, not by this module.

Values are epoch seconds (as float strings) so the monitor can report *how*
stale a heartbeat is, not just that it exists. The TTL is the fail-safe: if
the writer dies, the key disappears and ``EXISTS`` alone already reads stale.
"""

from __future__ import annotations

import time

WORKER_HEARTBEAT_KEY = "worker:cloud:heartbeat"
BEAT_HEARTBEAT_KEY = "worker:beat:heartbeat"
GPU_HEARTBEAT_KEY = "worker:gpu:heartbeat"

#: TTL is ~3x the write interval so a delayed write never flaps the status and
#: a dead process shows up within one TTL.
WORKER_HEARTBEAT_TTL_SECONDS = 90
BEAT_HEARTBEAT_TTL_SECONDS = 180
WORKER_HEARTBEAT_INTERVAL_SECONDS = 30
BEAT_HEARTBEAT_INTERVAL_SECONDS = 60


def touch(client, key: str, ttl_seconds: int) -> None:
    """Write ``key`` = now with a TTL on a **sync** redis client.

    Sync because the writers are daemon threads inside the Celery worker/beat
    processes; those must not depend on the app's asyncio loop (which lives on
    a different thread in workers).
    """
    client.set(key, f"{time.time():.3f}", ex=ttl_seconds)


def age_seconds(value: str | None, *, now: float | None = None) -> float | None:
    """Age of a heartbeat value (epoch seconds), or None when unreadable."""
    if not value:
        return None
    try:
        then = float(value)
    except (TypeError, ValueError):
        # The GPU worker writes the literal "1"; callers treat that as "exists".
        return 0.0 if value.strip() == "1" else None
    return max(0.0, (now if now is not None else time.time()) - then)

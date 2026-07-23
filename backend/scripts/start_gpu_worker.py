#!/usr/bin/env python
"""Local GPU worker launcher with Redis heartbeat.

Usage:
    cd backend
    python scripts/start_gpu_worker.py

This starts a Celery worker that:
1. Sends a Redis heartbeat every 60 seconds (key: worker:gpu:heartbeat, TTL: 90s)
2. Consumes the transcription_gpu queue for WhisperX transcription

When this script exits (Ctrl+C or crash), the heartbeat key expires within 90s,
and the admin panel will show "Worker 离线".
"""

import os
import signal
import sys
import threading
import time

# Ensure backend/ is on sys.path so `from app.*` works when run as a script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_HEARTBEAT_KEY = "worker:gpu:heartbeat"
_HEARTBEAT_INTERVAL = 60  # seconds between heartbeats
_HEARTBEAT_TTL = 90  # seconds before key expires


def _heartbeat_loop(redis_url: str, stop_event: threading.Event):
    """Background thread: periodically set a Redis key to indicate the worker is alive."""
    import redis as redis_lib

    r = redis_lib.from_url(redis_url, decode_responses=True)
    while not stop_event.is_set():
        try:
            r.set(_HEARTBEAT_KEY, "1", ex=_HEARTBEAT_TTL)
        except Exception as e:
            print(f"[heartbeat] failed: {e}", file=sys.stderr)
        stop_event.wait(_HEARTBEAT_INTERVAL)
    # Clean up heartbeat key on shutdown
    try:
        r.delete(_HEARTBEAT_KEY)
        print("[heartbeat] key deleted")
    except Exception:
        pass


def _security_guard() -> None:
    """Check that the GPU worker environment does NOT contain DB or OSS credentials.

    This is a hard security boundary: the GPU worker must never touch the database
    or object storage. It only receives tasks via Redis and POSTs results back
    via the transcription callback endpoint.
    """
    FORBIDDEN_KEYS = ["DATABASE_URL", "OSS_ACCESS_KEY", "OSS_SECRET_KEY"]
    found = [k for k in FORBIDDEN_KEYS if os.environ.get(k)]
    if found:
        print(
            "\n[SECURITY] GPU worker must NOT have DB or OSS credentials.\n"
            f"[SECURITY] Found forbidden env vars: {', '.join(found)}\n"
            "[SECURITY] Remove them from the GPU worker environment and restart.\n",
            file=sys.stderr,
        )
        sys.exit(1)


def main():
    # ── Security guard: GPU worker must NOT have DB or OSS credentials ──
    _security_guard()

    # Lazy import to avoid side effects during module import
    from app.core.config import get_settings
    from app.tasks.celery_app import celery_app

    settings = get_settings()

    print("=" * 60)
    print("SeeWord — Local GPU Worker + Heartbeat")
    print("=" * 60)
    print(f"  Redis:  {settings.redis_url}")
    print(f"  Queue:  {settings.transcription_gpu_queue_name}")
    print(f"  Beat:   every {_HEARTBEAT_INTERVAL}s, TTL {_HEARTBEAT_TTL}s")
    print("=" * 60)

    # Start heartbeat in a daemon thread
    stop_event = threading.Event()
    hb_thread = threading.Thread(
        target=_heartbeat_loop,
        args=(settings.redis_url, stop_event),
        daemon=True,
        name="gpu-heartbeat",
    )
    hb_thread.start()
    print("[heartbeat] started — admin panel will show 'Worker 在线'")

    # Handle Ctrl+C gracefully
    def _shutdown(signum, frame):
        print("\n[shutdown] stopping heartbeat and worker...")
        stop_event.set()
        hb_thread.join(timeout=3)
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    # Start Celery worker — this blocks until shutdown
    argv = [
        "worker",
        "--pool=solo",
        f"--queues={settings.transcription_gpu_queue_name}",
        "--loglevel=info",
        "--concurrency=1",
    ]
    celery_app.worker_main(argv)


if __name__ == "__main__":
    main()

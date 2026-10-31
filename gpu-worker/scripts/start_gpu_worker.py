#!/usr/bin/env python
"""Local GPU worker launcher with Redis heartbeat.

Usage:
    cd gpu-worker
    python scripts/start_gpu_worker.py

This starts a Celery worker that:
1. Sends a Redis heartbeat every 60 seconds (key: worker:gpu:heartbeat, TTL: 90s)
2. Consumes the transcription_gpu queue for WhisperX transcription

When this script exits (Ctrl+C or crash), the heartbeat key expires within 90s,
and the cloud admin panel will show "Worker 离线".
"""

import os
import signal
import sys
import threading
from urllib.parse import urlsplit, urlunsplit

# Ensure gpu-worker/ (the parent of scripts/) is on sys.path so `from gpu_worker.*`
# works when this file is run as a script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Imported after the sys.path setup above (E402 is ignored in pyproject.toml).
from gpu_worker.contracts import (
    HEARTBEAT_INTERVAL_SECONDS,
    HEARTBEAT_KEY,
    HEARTBEAT_TTL_SECONDS,
)

_HEARTBEAT_KEY = HEARTBEAT_KEY
_HEARTBEAT_INTERVAL = HEARTBEAT_INTERVAL_SECONDS  # seconds between heartbeats
_HEARTBEAT_TTL = HEARTBEAT_TTL_SECONDS  # seconds before key expires


def _mask_redis_url(url: str) -> str:
    """Hide the Redis password before the URL is printed to a log.

    ``REDIS_URL`` carries the cloud Redis' ``requirepass`` in its userinfo, so
    the raw value must never reach a console log file (NSSM keeps one).
    """
    try:
        parts = urlsplit(url)
    except ValueError:
        return "<unparseable redis url>"
    if parts.password is None:
        return url
    userinfo = f"{parts.username}:" if parts.username else ":"
    host = parts.hostname or ""
    netloc = f"{userinfo}***@{host}"
    if parts.port:
        netloc += f":{parts.port}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


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
    from gpu_worker.broker_recovery import restore_orphaned_unacked
    from gpu_worker.broker_settings import broker_transport_options
    from gpu_worker.celery_app import celery_app
    from gpu_worker.config import get_settings
    from gpu_worker.logging import configure_logging

    configure_logging()
    settings = get_settings()

    # A10/OPS-04: re-queue in-flight messages left by a hard-killed previous
    # process. Celery's async loop never runs kombu's visibility restore, so
    # without this a killed transcription would sit in gpu_unacked forever.
    try:
        restored = restore_orphaned_unacked(settings.redis_url, broker_transport_options())
        if restored:
            print(f"[recovery] restored {restored} orphaned unacked message(s) to the queue")
    except Exception as exc:
        print(f"[recovery] skipped orphan restore: {exc}", file=sys.stderr)

    print("=" * 60)
    print("SeeWord — Local GPU Worker + Heartbeat")
    print("=" * 60)
    # Masked: the URL's userinfo carries the cloud Redis password.
    print(f"  Redis:  {_mask_redis_url(settings.redis_url)}")
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

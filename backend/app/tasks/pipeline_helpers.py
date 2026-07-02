"""Shared infrastructure for the video processing pipeline.

Provides the "lock + step recovery + error commit" skeleton that all three
pipeline tasks (process_video, finalize_video, localize_video) previously
duplicated.  Each task now declares its steps and delegates the plumbing
here.

Design goals (deep-module philosophy):
- **Leverage**: callers get lock/step/error semantics from a single import.
- **Locality**: the "what happens on failure" contract lives in one place.
- **Testability**: ``commit_error_state`` is a single seam for testing
  "any step throws → DB state is consistent".
"""

import json

from app.core.config import get_settings
from app.core.logging import get_logger
from app.tasks.async_helpers import run_async

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Step progress mapping — single source of truth
# ---------------------------------------------------------------------------

STEP_PROGRESS = {
    "extracting": 10,
    "transcribing": 30,
    "translating": 70,
    "annotating": 72,
    "prewarm_notes": 74,
    "downloading": 75,
    "transcoding": 90,
    "done": 100,
}

# ---------------------------------------------------------------------------
# Redis key TTLs
# ---------------------------------------------------------------------------

LOCK_TTL_SECONDS = 60 * 60  # 60 minutes (per-task; not held across the GPU gap)
STEPS_TTL_SECONDS = 3 * 60 * 60  # 3 hours (long videos need more time)

# ---------------------------------------------------------------------------
# Module-level sync Redis singleton
# ---------------------------------------------------------------------------

_sync_redis = None


def get_pipeline_redis():
    """Get a shared sync Redis client (module-level singleton).

    Celery tasks are synchronous so we use the sync redis client, sharing
    one connection across the module.
    """
    global _sync_redis
    if _sync_redis is None:
        import redis as redis_lib

        settings = get_settings()
        _sync_redis = redis_lib.from_url(settings.redis_url, decode_responses=True)
    return _sync_redis


# ---------------------------------------------------------------------------
# Progress tracking
# ---------------------------------------------------------------------------


async def update_progress(video_id: str, step: str, extra: dict | None = None) -> None:
    """Record a completed step in Redis.

    - Adds step name to Redis set ``video:steps:{video_id}`` (used for resume)
    - Sets TTL on the step-set

    Note: the DB ``processing_step``/``processing_progress`` fields (which the
    public ``/status`` endpoint reads) are written separately by each task.
    The orphan pub-sub channel (``video:progress:{id}``) was removed — the
    frontend polls the DB status endpoint instead.
    """
    try:
        r = get_pipeline_redis()
        steps_key = f"video:steps:{video_id}"
        r.sadd(steps_key, step)
        r.expire(steps_key, STEPS_TTL_SECONDS)
    except Exception:
        logger.warning("Failed to update progress for video %s step %s", video_id, step, exc_info=True)


async def is_step_done(video_id: str, step: str) -> bool:
    """Check if a step has already been completed (for resume).

    On Redis failure, returns True (conservative: assume the step is done so
    we skip re-running it).  This prevents wasteful re-execution of expensive
    steps (translation, transcoding) when Redis is temporarily unavailable.
    """
    try:
        r = get_pipeline_redis()
        return r.sismember(f"video:steps:{video_id}", step)
    except Exception:
        logger.warning(
            "Redis unavailable when checking step %s for video %s; assuming done",
            step,
            video_id,
            exc_info=True,
        )
        return True


# ---------------------------------------------------------------------------
# Distributed lock
# ---------------------------------------------------------------------------


def acquire_lock(video_id: str) -> bool:
    """Try to acquire a Redis lock for processing this video.

    Returns True if acquired.  On Redis failure, returns False (fail-closed):
    we refuse to start processing rather than risking duplicate concurrent
    workers.  The task will be retried by Celery after Redis recovers.
    """
    try:
        r = get_pipeline_redis()
        lock_key = f"video:processing:{video_id}"
        acquired = r.set(lock_key, "1", nx=True, ex=LOCK_TTL_SECONDS)
        return bool(acquired)
    except Exception:
        logger.warning(
            "Redis unavailable when acquiring lock for video %s; refusing to process", video_id, exc_info=True
        )
        return False


def release_lock(video_id: str) -> None:
    """Release the processing lock, keeping the completed-step set intact.

    Used by the pipeline head after enqueuing remote transcription: the lock
    is not held across the head→GPU→tail gap, so cross-task coordination
    relies on DB ``status``/``processing_step`` instead.
    """
    try:
        r = get_pipeline_redis()
        r.delete(f"video:processing:{video_id}")
    except Exception:
        logger.warning("Failed to release lock for video %s", video_id, exc_info=True)


def release_lock_and_steps(video_id: str) -> None:
    """Release the processing lock and clear completed steps."""
    try:
        r = get_pipeline_redis()
        r.delete(f"video:processing:{video_id}", f"video:steps:{video_id}")
    except Exception:
        logger.warning("Failed to release lock/steps for video %s", video_id, exc_info=True)


# ---------------------------------------------------------------------------
# Error-state commit — single seam for "any step throws → DB is consistent"
# ---------------------------------------------------------------------------


async def commit_error_state(video, db, error: Exception) -> None:
    """Set video to error status and commit.  Safe to call from an except block.

    If the commit itself fails, attempts a rollback.  This is the single
    implementation of the error-commit contract — previously duplicated in
    process_video, finalize_video, and localize_video.
    """
    try:
        video.status = "error"
        video.error_message = str(error)
        await db.commit()
    except Exception:
        logger.exception("Failed to commit error state for video %s", video.id)
        try:
            await db.rollback()
        except Exception:
            logger.exception("Rollback also failed for video %s", video.id)


# ---------------------------------------------------------------------------
# Task runner — wraps run_async without the forbidden RuntimeError fallback
# ---------------------------------------------------------------------------


def run_pipeline_task(coro) -> None:
    """Run an async pipeline coroutine via the shared event loop.

    If ``run_async`` raises RuntimeError (shared loop thread died), the task
    should fail and let Celery retry — we do NOT create a new event loop
    (that would violate the project convention and break AsyncOpenAI clients
    that cache loop references).
    """
    run_async(coro)

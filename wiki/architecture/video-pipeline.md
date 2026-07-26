---
title: Video Processing Pipeline
tags: [architecture, video, backend, celery, gpu]
status: active
confidence: verified
related_code: [video-pipeline, celery-tasks]
related: [.agent/context.md, docs/adr/0004-ugc-pipeline-admin-triggered.md]
created: 2026-07-21
updated: 2026-07-25
---

# Background

The video processing pipeline is the most complex subsystem. It is split across three Celery tasks bridged by HTTP callback.

# Pipeline

```
process_video (head, cloud worker, default queue)
  → extract metadata (yt-dlp/ffprobe)
  → stage local uploads to OSS (signed URL for GPU)
  → enqueue transcribe_video_gpu

transcribe_video_gpu (GPU worker, transcription_gpu queue)
  → WhisperX transcription (no DB session, no OSS credentials — imports VideoSource enum only)
  → POST callback to cloud /api/v1/internal/transcription/callback (Redis dedup lock, fail-closed)

finalize_video (tail, cloud worker, triggered by callback)
  → translate subtitles (AI batch)
  → annotate exam words (ECDICT, local)
  → prewarm AI word notes (batch LLM)
  → download video + transcode (ffmpeg 480p/720p/1080p)
  → mark ready
```

# Queue Topology

- `celery` (default) = cloud worker (head/tail/localize/comments/orders)
- `transcription_gpu` = remote GPU worker (transcription only)

Configured in `backend/app/tasks/celery_app.py` with `task_routes`.

# Progress Tracking

- Redis sets `video:steps:{id}` — resume support, each step checks `is_step_done()` (fail-closed: returns False on Redis failure, re-runs step)
- DB `processing_step` / `processing_progress` — public API (frontend polls `/status`)
- ~~Redis pub/sub `video:progress:{id}`~~ — REMOVED (was orphan, zero subscribers)

# Beat Schedule

- `expire-pending-orders` every 5 min
- `reconcile-pending-orders` every 15 min (query payment provider for lost callbacks)
- `watchdog-stale-transcriptions` every 10 min
- `score-videos-hourly` every hour (top 200 by view_count)
- `score-videos-daily` every day (full recompute)
- `downgrade-expired-pro` every hour (ADR-0007)
- `expire-unused-redeem-codes` every day (ADR-0007)

# Async in Celery Tasks

Celery workers are synchronous. Do NOT use `asyncio.run()` per task. Use `run_async()` from `backend/app/tasks/async_helpers.py` — it maintains one long-lived event loop in a daemon thread via `asyncio.run_coroutine_threadsafe()`.

```python
@celery_app.task
def my_task(arg):
    result = run_async(_do_work(arg))
    return result

async def _do_work(arg):
    ...
```

# Why This Design

1. **Three-stage split**: GPU worker has no DB session or OSS credentials — even if compromised, data is safe
2. **HTTP callback with dedup lock**: Redis SETNX lock prevents concurrent callbacks from double-inserting subtitles. Fail-closed: rejects callback if Redis is down, GPU worker retries
3. **Checkpoint resume**: Many steps, long processing time — failure can resume from breakpoint (fail-closed: re-runs step if Redis unavailable)
4. **Redis sets not hash**: Step completion is set semantics, only needs "done" marker
5. **Fail-closed for locks**: Both pipeline lock and callback lock return False on Redis failure, refusing to process rather than risking duplicate work

# Future Notes

- GPU worker callback failure: watchdog detects stale tasks and re-enqueues
- New processing steps must update both `_is_step_done()` and Redis sets
- AI translation and word note prewarming are the most time-consuming parts of finalize — batch size must balance speed and API rate limits

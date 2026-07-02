from celery import Celery
from kombu import Queue

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "speaking",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Queue topology: the cloud worker consumes the default ``celery`` queue;
    # the remote GPU worker consumes ``transcription_gpu`` exclusively. Only
    # the transcription task is routed off the default queue — everything else
    # (video pipeline head/tail, localize, comment analysis, order expiry) runs
    # on the cloud.
    task_default_queue="celery",
    task_queues=(Queue("celery"), Queue(settings.transcription_gpu_queue_name)),
    task_routes={
        "app.tasks.video_processing.transcribe_video_gpu": {"queue": settings.transcription_gpu_queue_name},
    },
    beat_schedule={
        "expire-pending-orders": {
            "task": "app.tasks.order_tasks.expire_pending_orders",
            "schedule": 300,  # every 5 minutes
        },
        # Reconcile orders whose callback may have been lost — query the
        # payment provider for authoritative status and upgrade the user
        # if the platform reports the order paid.
        "reconcile-pending-orders": {
            "task": "app.tasks.order_tasks.reconcile_pending_orders",
            "schedule": 900,  # every 15 minutes
        },
        # Mark videos stuck in "transcribing" as failed when the GPU worker is
        # offline for longer than ``video_transcribe_timeout``.
        "watchdog-stale-transcriptions": {
            "task": "app.tasks.video_processing.watchdog_stale_transcriptions",
            "schedule": 600,  # every 10 minutes
        },
    },
)

# Ensure all models are loaded before importing task modules (SQLAlchemy relationship resolution)
# Register the task_prerun signal that binds request_id (task_id) into
# structlog context vars so every log line emitted during a Celery task
# automatically includes request_id for traceability.
import app.core.logging as _logging
import app.models
import app.tasks.video_processing

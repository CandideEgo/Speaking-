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
        # P1 scoring: refresh hot videos hourly, all videos daily. New videos
        # are also scored immediately at the end of finalize_video.
        "score-videos-hourly": {
            "task": "app.tasks.scoring_tasks.compute_top_scores",
            "schedule": 3600,  # every hour — Top 200 by view_count
        },
        "score-videos-daily": {
            "task": "app.tasks.scoring_tasks.compute_all_scores",
            "schedule": 86400,  # every day — full recompute
        },
        # ADR-0007: write back plan=free for users whose Pro has expired.
        # require_pro_user only blocks expired Pro on access; it never wrote
        # back free, so pro_users was inflated. Hourly downgrade closes that.
        "downgrade-expired-pro": {
            "task": "app.tasks.redeem_tasks.downgrade_expired_pro",
            "schedule": 3600,  # every hour
        },
        # ADR-0007: flip unused codes past their expires_at to expired so
        # stale inventory can't be redeemed.
        "expire-unused-redeem-codes": {
            "task": "app.tasks.redeem_tasks.expire_unused_redeem_codes",
            "schedule": 86400,  # every day
        },
    },
)

# Ensure all models are loaded before importing task modules (SQLAlchemy relationship resolution)
# Register the task_prerun signal that binds request_id (task_id) into
# structlog context vars so every log line emitted during a Celery task
# automatically includes request_id for traceability.
import app.core.logging as _logging
import app.models
import app.tasks.order_tasks
import app.tasks.redeem_tasks
import app.tasks.scoring_tasks
import app.tasks.video_processing

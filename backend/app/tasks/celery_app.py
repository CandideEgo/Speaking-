from celery import Celery

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
    beat_schedule={
        "expire-pending-orders": {
            "task": "app.tasks.order_tasks.expire_pending_orders",
            "schedule": 300,  # every 5 minutes
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

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
)

# Ensure all models are loaded before importing task modules (SQLAlchemy relationship resolution)
import app.models  # noqa: F401
import app.tasks.video_processing  # noqa: F401

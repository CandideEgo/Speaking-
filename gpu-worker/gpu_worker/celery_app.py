"""Celery application for the GPU worker.

Deliberately smaller than the cloud's ``backend/app/tasks/celery_app.py``: one
queue (``transcription_gpu``), one task, no beat schedule. The worker must never
consume the cloud's default ``celery`` queue — it has no database and no other
task modules, so a stray message would be an unregistered-task failure there.

Task routing uses the compatibility task name from :mod:`gpu_worker.contracts`;
see the comment in :mod:`gpu_worker.tasks` for why the old dotted name is kept.
"""

from celery import Celery
from kombu import Queue

from gpu_worker.config import get_settings
from gpu_worker.contracts import TASK_NAME

settings = get_settings()

celery_app = Celery(
    "gpu-worker",
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
    # Queue topology: this worker consumes ``transcription_gpu`` exclusively.
    task_default_queue=settings.transcription_gpu_queue_name,
    task_queues=(Queue(settings.transcription_gpu_queue_name),),
    task_routes={TASK_NAME: {"queue": settings.transcription_gpu_queue_name}},
)

# Import for side effects: registers the task on ``celery_app`` and the
# task_prerun request_id binding. ``gpu_worker.tasks`` imports this module's
# ``celery_app`` back, which is safe because the app object already exists by
# the time these lines run (and a second import of a module mid-initialisation
# is just a sys.modules lookup). E402/F401 are ignored in pyproject.toml — this
# is the same "task registration at the bottom" pattern as the cloud worker.
import gpu_worker.logging
import gpu_worker.tasks

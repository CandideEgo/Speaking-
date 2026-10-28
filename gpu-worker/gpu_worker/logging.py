"""Structured logging for the GPU worker (structlog).

Same shape as the cloud's ``backend/app/core/logging.py`` so the worker's log
lines are parseable by the same aggregators:

- JSON renderer when ``ENV=production`` (Loki/ELK), colored console otherwise
- ``request_id`` context binding for Celery tasks via the ``task_prerun``
  signal, so every line emitted while a task runs carries its task id

Kept local instead of importing the backend's module: the worker is a separate
deployable and must not depend on ``app.*``.
"""

import logging
import uuid

import structlog
from celery.signals import task_prerun

from gpu_worker.config import get_settings


def configure_logging() -> None:
    """Configure structlog + the root stdlib logger level.

    Idempotent enough to call once at process start; task code itself must not
    call it (Celery owns the worker process's logging setup after startup).
    """
    settings = get_settings()

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    if settings.env == "production":
        # JSON output for log aggregators (Loki, ELK, etc.)
        renderer = structlog.processors.JSONRenderer()
    else:
        # Colored console output for development
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Set root stdlib logger level so third-party libs respect it
    logging.getLogger().setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a structured logger instance.

    Usage::

        logger = get_logger(__name__)
        logger.info("message", key=value)
    """
    return structlog.get_logger(name or __name__)


@task_prerun.connect
def _bind_celery_request_id(sender=None, task_id=None, task=None, **kwargs):
    """Bind ``request_id`` (the Celery task id) before each task runs.

    Registered at import of this module. ``gpu_worker.celery_app`` imports it
    explicitly for that side effect, mirroring the cloud worker.
    """
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=task_id or str(uuid.uuid4()))

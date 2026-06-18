"""Structured logging configuration using structlog.

Provides:
- JSON renderer for production (machine-parseable logs for Loki/ELK)
- ConsoleRenderer for development (colored, human-readable)
- request_id binding for Celery tasks via task_prerun signal
- get_logger() helper for consistent logger creation
"""
import logging
import uuid

import structlog
from celery.signals import task_prerun

from app.core.config import get_settings

settings = get_settings()


def configure_logging() -> None:
    """Configure structlog for the application.

    In production: JSON-formatted logs for machine parsing.
    In development: colored console output for readability.
    """
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
        processors=shared_processors + [renderer],
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


# ---------------------------------------------------------------------------
# Celery request_id binding
# ---------------------------------------------------------------------------

@task_prerun.connect
def _bind_celery_request_id(sender=None, task_id=None, task=None, **kwargs):
    """Bind request_id context variable before each Celery task runs.

    This allows all log messages emitted during a task to include the
    task_id as ``request_id`` automatically, making it trivial to filter
    logs for a specific task invocation.
    """
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=task_id or str(uuid.uuid4()))

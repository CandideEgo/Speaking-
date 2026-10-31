"""Process observability bootstrap (A09/OPS-05).

Sentry was only initialised in the web process (``app/main.py``); worker and
beat exceptions never reached it, and the same init was missing a scrubber for
the credentials this app carries in URLs. ``init_sentry`` is the single entry
point now — web calls it with ``role="web"``, ``celery_app`` with
``role="worker"``/``"beat"``.
"""

from __future__ import annotations

import sys
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.redaction import redact_value

logger = get_logger(__name__)

_SENSITIVE_HEADERS = frozenset({"authorization", "cookie", "x-callback-secret", "x-api-key"})


def _scrub_event(event: Any, _hint: Any) -> Any:
    """Remove credentials from the payload before it leaves the process."""
    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = {k: v for k, v in headers.items() if k.lower() not in _SENSITIVE_HEADERS}
        if isinstance(request.get("query_string"), str):
            from app.core.redaction import redact

            request["query_string"] = redact(request["query_string"])
    return redact_value(event)


def init_sentry(role: str) -> bool:
    """Initialise Sentry for this process role. Returns True when initialised."""
    settings = get_settings()
    if not settings.sentry_dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.env,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
        send_default_pii=False,
        before_send=_scrub_event,
    )
    sentry_sdk.set_tag("process_role", role)
    logger.info("Sentry initialized", environment=settings.env, role=role)
    return True


def celery_role() -> str:
    """``beat`` when this process is the scheduler, else ``worker``."""
    return "beat" if any(arg == "beat" for arg in sys.argv) else "worker"

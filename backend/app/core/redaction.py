"""Redaction for anything that leaves the process (Sentry, alert webhooks).

Two classes of secret reach these channels by accident, and both are already
in this codebase's URLs:

- media URLs carry the access token as ``?token=<JWT>`` (``<video>``/``<audio>``
  cannot send headers — see ``frontend/src/lib/mediaUrl``);
- connection strings carry passwords (``redis://:pw@host``, ``postgresql+asyncpg://user:pw@host``).

Exception payloads and alert messages are user-influenced text, so redaction is
applied defensively to everything rather than assuming callers are careful.
"""

from __future__ import annotations

import re

#: ``scheme://user:password@host`` and ``scheme://:password@host`` -> ``scheme://***@host``.
#: The user part is optional because Redis URLs are commonly ``redis://:pw@host``.
_CREDENTIALS_IN_URL = re.compile(r"(?P<scheme>[a-z][a-z0-9+.-]*://)[^\s/@]*:[^\s/@]+@", re.IGNORECASE)

#: ``token=...`` / ``sign=...`` / ``secret=...`` query parameters.
_SECRET_QUERY_PARAM = re.compile(
    r"(?P<name>\b(?:token|access_token|refresh_token|sign|signature|secret|password)=)[^&\s#]+",
    re.IGNORECASE,
)

#: ``Bearer <jwt>`` in headers or log lines.
_BEARER = re.compile(r"(?P<prefix>\bBearer\s+)[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE)

REDACTED = "***"


def redact(text: str) -> str:
    """Strip the three common secret shapes from ``text`` (idempotent)."""
    if not text:
        return text
    text = _CREDENTIALS_IN_URL.sub(lambda m: f"{m.group('scheme')}{REDACTED}@", text)
    text = _SECRET_QUERY_PARAM.sub(lambda m: f"{m.group('name')}{REDACTED}", text)
    return _BEARER.sub(lambda m: f"{m.group('prefix')}{REDACTED}", text)


def redact_value(value):
    """Recursively redact strings inside dicts/lists (Sentry event payloads)."""
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, dict):
        return {key: redact_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_value(item) for item in value]
    return value

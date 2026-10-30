"""External alert channel (E4).

Posts critical alerts to an out-of-band webhook (DingTalk / Slack / generic
JSON POST) so admins get notified even when they're not watching the dashboard.
When ``alert_webhook_url`` is unset, alerts fall back to in-app ``notify_admins``
(an in-app notification) so no alert is ever silently dropped.

Callers:
  - ``app/tasks/pipeline_dispatch_tasks.py`` — undelivered pipeline backlog.
  - ``app/services/health_monitor.py`` — worker/beat staleness, queue backlog,
    disk, DB reachability and pipeline failure rate (A09/OPS-05).

Every message is passed through ``app.core.redaction.redact`` before it leaves
the process: alert text is user-influenced and this app carries JWTs in media
URLs and passwords in connection strings.
"""

import base64
import hashlib
import hmac
import time
import urllib.parse
from datetime import UTC, datetime

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.redaction import redact

logger = get_logger(__name__)


# In-app fallback (avoids a circular import at module load).
async def _notify_admins_fallback(title: str, message: str) -> None:
    from sqlalchemy import select

    from app.core.database import get_session_maker
    from app.models.user import RoleType, User
    from app.services.notification_service import create_notification

    session_maker = get_session_maker()
    async with session_maker() as db:
        admins = (await db.scalars(select(User).where(User.role == RoleType.admin))).all()
        for a in admins:
            await create_notification(
                user_id=a.id,
                type="quality_alert",
                title=title,
                message=message,
                db=db,
            )
        await db.commit()


def _dingtalk_sign(secret: str, timestamp: int) -> str:
    """DingTalk webhook signature: base64(hmac_sha256(secret, f'{ts}\n{secret}'))."""
    string_to_sign = f"{timestamp}\n{secret}"
    hmac_code = hmac.new(secret.encode("utf-8"), string_to_sign.encode("utf-8"), digestmod=hashlib.sha256).digest()
    return urllib.parse.quote_plus(base64.b64encode(hmac_code).decode("utf-8"))


async def send_alert(title: str, message: str, *, severity: str = "warning") -> bool:
    """Send an alert to the external webhook. Returns True if posted (or fell
    back to in-app), False on hard failure.

    The request body is DingTalk's text shape ``{"msgtype": "text", "text":
    {"content": "[SEVERITY] title\nmessage\ntimestamp"}}``; severity and
    timestamp travel inside the ``content`` string, not as top-level fields.
    When ``alert_webhook_secret`` is set, DingTalk-style signing is appended.
    """
    settings = get_settings()
    ts = datetime.now(UTC).isoformat()
    title = redact(title)
    message = redact(message)

    # No out-of-band channel configured -> fall back to in-app admin notification.
    if not settings.alert_webhook_url:
        try:
            await _notify_admins_fallback(title, message)
        except Exception:
            logger.warning("alert in-app fallback failed", exc_info=True)
            return False
        return True

    content = f"[{severity.upper()}] {title}\n{message}\n{ts}"
    payload: dict = {"msgtype": "text", "text": {"content": content}}
    url = settings.alert_webhook_url
    # DingTalk signing.
    if settings.alert_webhook_secret and "oapi.dingtalk.com" in url:
        ts_int = int(time.time() * 1000)
        sign = _dingtalk_sign(settings.alert_webhook_secret, ts_int)
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}timestamp={ts_int}&sign={sign}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
        if resp.status_code >= 400:
            logger.warning("alert webhook non-2xx", status=resp.status_code, body=resp.text[:200])
            return False
        # DingTalk-style webhooks answer HTTP 200 with a non-zero `errcode` when
        # they rejected the message, so the status code alone is not proof.
        try:
            errcode = resp.json().get("errcode")
        except Exception:
            errcode = None
        if errcode:
            logger.warning("alert webhook rejected", errcode=errcode, body=resp.text[:200])
            return False
        return True
    except Exception:
        logger.warning("alert webhook failed", exc_info=True)
        return False

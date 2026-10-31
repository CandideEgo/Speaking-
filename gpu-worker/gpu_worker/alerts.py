"""Out-of-band alert channel for the GPU worker (DingTalk / generic webhook).

A trimmed copy of ``backend/app/services/alert_service.py``. The GPU worker has
no database, so the cloud's "no webhook configured" fallback (in-app
``notify_admins`` rows) is impossible here: when ``ALERT_WEBHOOK_URL`` is unset
we only log at ``warning`` level. That is intentional — an alert without a
channel is an operator-visible log line, not a silent success.

Body shape is DingTalk's text message; when ``ALERT_WEBHOOK_SECRET`` is set and
the URL is a DingTalk webhook, the DingTalk HMAC signature is appended.
"""

import base64
import hashlib
import hmac
import time
import urllib.parse
from datetime import UTC, datetime

import httpx

from gpu_worker.config import get_settings
from gpu_worker.logging import get_logger

logger = get_logger(__name__)


def _dingtalk_sign(secret: str, timestamp: int) -> str:
    """DingTalk webhook signature: base64(hmac_sha256(secret, f'{ts}\\n{secret}'))."""
    string_to_sign = f"{timestamp}\n{secret}"
    hmac_code = hmac.new(secret.encode("utf-8"), string_to_sign.encode("utf-8"), digestmod=hashlib.sha256).digest()
    return urllib.parse.quote_plus(base64.b64encode(hmac_code).decode("utf-8"))


async def send_alert(title: str, message: str, *, severity: str = "warning") -> bool:
    """Send an alert to the configured webhook. Best effort — never raises.

    Returns True when the webhook accepted the message, False on any hard
    failure (including "no webhook configured", which only logs).
    """
    settings = get_settings()
    ts = datetime.now(UTC).isoformat()

    if not settings.alert_webhook_url:
        # No out-of-band channel on this machine: log only (no DB fallback —
        # the GPU worker has no database by design).
        logger.warning("alert_webhook_not_configured", title=title, message=message, severity=severity)
        return False

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

"""Alibaba Cloud Dysmsapi SMS verification-code service.

Sends verification codes via the Dysmsapi ``SendSms`` API with configurable
templates per purpose (register / change_phone / reset_password).  Codes are
generated locally, stored in Redis with a TTL, and verified server-side —
unlike the previous Dypnsapi approach where Aliyun generated and verified
the codes.  This gives us full control over template selection and supports
all three custom SMS templates (100001/100002/100003).

Redis keys
----------
- ``sms:code:{phone}:{purpose}`` — the stored verification code (TTL from
  ``settings.sms_code_expire_seconds``, default 5 min).
- ``sms:cooldown:{phone}:{purpose}`` — per-phone-per-purpose send cooldown
  (set by the route layer, 60 s).

Dev fallback: when ``sms_login_enabled`` is False (or AK/SK are unset),
``send_verify_code`` logs a fixed code and stores it in Redis; ``verify_code``
accepts ``"1234"``.  This lets phone login work locally with no Aliyun
credentials or spend.
"""

import random
import threading

import structlog

from app.core.config import get_settings
from app.core.redis import get_redis

logger = structlog.get_logger(__name__)

# Lazy imports for Alibaba Cloud SDK — may not be installed in dev/test.
_dysmsapi_models = None
_DysmsapiClient = None
_open_api_models = None


def _ensure_sdk():
    """Import Alibaba Cloud SDK on first real use (avoids ImportError in dev/test)."""
    global _dysmsapi_models, _DysmsapiClient, _open_api_models
    if _dysmsapi_models is None:
        from alibabacloud_dysmsapi20170525 import models as dysmsapi_models
        from alibabacloud_dysmsapi20170525.client import Client as DysmsapiClient
        from alibabacloud_tea_openapi import models as open_api_models

        _dysmsapi_models = dysmsapi_models
        _DysmsapiClient = DysmsapiClient
        _open_api_models = open_api_models


# Fixed code accepted in dev-fake mode (no Aliyun credentials configured).
_DEV_FAKE_CODE = "1234"

# Template-code mapping by purpose.
_PURPOSE_TEMPLATES = {
    "register": "aliyun_sms_template_register",
    "change_phone": "aliyun_sms_template_change_phone",
    "reset_password": "aliyun_sms_template_reset_password",
}

_client = None
_singleton_lock = threading.Lock()


def get_sms_client():
    """Lazy thread-safe singleton for the Dysmsapi client."""
    global _client
    if _client is None:
        with _singleton_lock:
            if _client is None:
                _ensure_sdk()
                settings = get_settings()
                config = _open_api_models.Config(
                    access_key_id=settings.aliyun_sms_access_key,
                    access_key_secret=settings.aliyun_sms_secret_key,
                    endpoint=settings.aliyun_sms_endpoint,
                )
                _client = _DysmsapiClient(config)
    return _client


def _real_send_enabled() -> bool:
    """True only when SMS login is enabled AND AK/SK are configured."""
    settings = get_settings()
    return bool(settings.sms_login_enabled and settings.aliyun_sms_access_key and settings.aliyun_sms_secret_key)


def _generate_code() -> str:
    """Generate a random 6-digit verification code."""
    return f"{random.randint(0, 999999):06d}"


async def send_verify_code(phone: str, purpose: str = "register") -> None:
    """Send an SMS verification code to ``phone`` for the given ``purpose``.

    The code is stored in Redis at ``sms:code:{phone}:{purpose}`` with a TTL
    (default 5 minutes).  In dev-fake mode the fixed code ``"1234"`` is used
    and no Aliyun API call is made.  Raises RuntimeError on Aliyun API failure
    so the route can surface a 502.
    """
    settings = get_settings()
    redis = get_redis()

    code = _DEV_FAKE_CODE if not _real_send_enabled() else _generate_code()

    # Store code in Redis (overwrite any previous code for this phone+purpose).
    ttl = settings.sms_code_expire_seconds
    try:
        await redis.set(f"sms:code:{phone}:{purpose}", code, ex=ttl)
    except Exception:
        # Fail-open: Redis outage must not block SMS sending.
        logger.warning("sms_code_store_failed", phone=phone, purpose=purpose)

    if not _real_send_enabled():
        logger.info("[sms-fake] code=%s for %s (purpose=%s)", code, phone, purpose)
        return

    # Resolve template code from settings based on purpose.
    template_attr = _PURPOSE_TEMPLATES.get(purpose)
    if not template_attr:
        raise ValueError(f"Unknown SMS purpose: {purpose}")
    template_code = getattr(settings, template_attr)

    # Template param: {"code":"XXXXXX","min":"5"} — matches Aliyun standard templates.
    minutes = str(max(1, ttl // 60))
    template_param = f'{{"code":"{code}","min":"{minutes}"}}'

    client = get_sms_client()
    _ensure_sdk()
    request = _dysmsapi_models.SendSmsRequest(
        phone_numbers=phone,
        sign_name=settings.aliyun_sms_sign_name,
        template_code=template_code,
        template_param=template_param,
    )
    try:
        resp = await client.send_sms_with_options_async(request, None)
    except Exception as exc:
        msg = getattr(exc, "message", str(exc))
        logger.error("sms_send_failed", phone=phone, purpose=purpose, error=msg)
        raise RuntimeError(f"SMS send failed: {msg}") from exc

    body = getattr(resp, "body", None)
    resp_code = getattr(body, "code", None) if body else None
    if resp_code != "OK":
        message = getattr(body, "message", "") if body else ""
        logger.error("sms_send_non_ok", phone=phone, purpose=purpose, code=resp_code, message=message)
        raise RuntimeError(f"SMS send failed: {resp_code} {message}")


async def verify_code(phone: str, code: str, purpose: str = "register") -> bool:
    """Verify an SMS code against the stored code in Redis (or accept dev-fake code).

    The code is one-time-use: deleted from Redis on successful verification.
    """
    redis = get_redis()
    key = f"sms:code:{phone}:{purpose}"

    # Dev-fake mode: accept the fixed code without checking Redis.
    if not _real_send_enabled():
        if code != _DEV_FAKE_CODE:
            return False
        # Also try to delete from Redis (best-effort) to prevent reuse.
        try:
            await redis.delete(key)
        except Exception:
            pass
        return True

    # Production: read from Redis.
    try:
        stored = await redis.get(key)
    except Exception:
        # Redis outage: fail-closed (deny verification) rather than accept.
        logger.warning("sms_verify_redis_error", phone=phone, purpose=purpose)
        return False

    if stored is None or stored != code:
        return False

    # One-time use: delete the code after successful verification.
    try:
        await redis.delete(key)
    except Exception:
        logger.warning("sms_code_delete_failed", phone=phone, purpose=purpose)

    return True

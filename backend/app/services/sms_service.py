"""Alibaba Cloud Dypnsapi SMS verification-code service.

Sends and verifies SMS login codes via the Dypnsapi ``SendSmsVerifyCode`` /
``CheckSmsVerifyCode`` APIs. Aliyun generates and stores the code server-side,
so this service does NOT persist codes itself — only a per-phone send cooldown
(lived in Redis by the route layer) to throttle abuse.

Dev fallback: when ``sms_login_enabled`` is False (or AK/SK are unset),
``send_verify_code`` logs a fixed code and ``verify_code`` accepts ``"1234"``.
This lets phone login work locally with no Aliyun credentials or spend.
"""

import threading

import structlog
from alibabacloud_dypnsapi20170525 import models as dypnsapi_models
from alibabacloud_dypnsapi20170525.client import Client as DypnsapiClient
from alibabacloud_tea_openapi import models as open_api_models
from alibabacloud_tea_util import models as util_models

from app.core.config import get_settings

logger = structlog.get_logger(__name__)

# Fixed code accepted in dev-fake mode (no Aliyun credentials configured).
_DEV_FAKE_CODE = "1234"

_client: DypnsapiClient | None = None
_singleton_lock = threading.Lock()


def get_sms_client() -> DypnsapiClient:
    """Lazy thread-safe singleton for the Dypnsapi client."""
    global _client
    if _client is None:
        with _singleton_lock:
            if _client is None:
                settings = get_settings()
                config = open_api_models.Config(
                    access_key_id=settings.aliyun_sms_access_key,
                    access_key_secret=settings.aliyun_sms_secret_key,
                    endpoint=settings.aliyun_sms_endpoint,
                )
                _client = DypnsapiClient(config)
    return _client


def _real_send_enabled() -> bool:
    """True only when SMS login is enabled AND AK/SK are configured."""
    settings = get_settings()
    return bool(settings.sms_login_enabled and settings.aliyun_sms_access_key and settings.aliyun_sms_secret_key)


async def send_verify_code(phone: str) -> None:
    """Send an SMS verification code to ``phone``.

    In dev-fake mode, logs the code instead of calling Aliyun. Raises
    RuntimeError on Aliyun API failure so the route can surface a 502.
    """
    if not _real_send_enabled():
        logger.info("[sms-fake] code=%s for %s", _DEV_FAKE_CODE, phone)
        return

    settings = get_settings()
    client = get_sms_client()
    request = dypnsapi_models.SendSmsVerifyCodeRequest(
        sign_name=settings.aliyun_sms_sign_name,
        template_code=settings.aliyun_sms_template_code,
        phone_number=phone,
        template_param='{"code":"##code##","min":"5"}',
    )
    try:
        resp = await client.send_sms_verify_code_with_options_async(request, util_models.RuntimeOptions())
    except Exception as exc:
        # tea-sdk exceptions carry .message and .data["Recommend"]
        msg = getattr(exc, "message", str(exc))
        logger.error("sms_send_failed", phone=phone, error=msg)
        raise RuntimeError(f"SMS send failed: {msg}") from exc

    body = getattr(resp, "body", None)
    code = getattr(body, "code", None) if body else None
    if code != "OK":
        message = getattr(body, "message", "") if body else ""
        logger.error("sms_send_non_ok", phone=phone, code=code, message=message)
        raise RuntimeError(f"SMS send failed: {code} {message}")


async def verify_code(phone: str, code: str) -> bool:
    """Verify an SMS code against Aliyun (or accept the dev-fake code)."""
    if not _real_send_enabled():
        return code == _DEV_FAKE_CODE

    client = get_sms_client()
    request = dypnsapi_models.CheckSmsVerifyCodeRequest(
        phone_number=phone,
        verify_code=code,
    )
    try:
        resp = await client.check_sms_verify_code_with_options_async(request, util_models.RuntimeOptions())
    except Exception as exc:
        msg = getattr(exc, "message", str(exc))
        logger.error("sms_verify_failed", phone=phone, error=msg)
        return False

    body = getattr(resp, "body", None)
    # Top-level code=="OK" means the API call succeeded; the actual pass/fail
    # verdict is in body.model.verify_result ("PASS" == correct code).
    api_code = getattr(body, "code", None) if body else None
    if api_code != "OK":
        logger.warning("sms_verify_non_ok", phone=phone, code=api_code)
        return False
    model = getattr(body, "model", None)
    verify_result = getattr(model, "verify_result", None) if model else None
    logger.info("sms_verify_result", phone=phone, verify_result=verify_result)
    return verify_result == "PASS"

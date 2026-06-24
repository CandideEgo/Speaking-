"""WeChat Pay provider — stub implementation.

This stub validates the provider interface and contains the signature
verification logic migrated from ``payments.py``.  To activate real
WeChat Pay integration, implement ``create_order()`` using the
``wechatpay-v3`` package and configure the required settings.
"""

import hashlib
import hmac

import structlog
from fastapi import Request

from app.core.config import get_settings
from app.models.order import OrderStatus
from app.services.payment_provider import PaymentProvider

logger = structlog.get_logger()
settings = get_settings()


class WechatPaymentProvider(PaymentProvider):
    """WeChat Pay Native/JSAPI provider (stub)."""

    async def create_order(self, order_number: str, amount: int, plan: str, **kwargs) -> str:
        """Create a WeChat Pay order.  Not yet implemented."""
        raise NotImplementedError(
            "WeChat Pay integration not yet configured. "
            "Set default_payment_provider='mock' in settings, or implement "
            "WechatPaymentProvider.create_order() with the wechatpay-v3 package."
        )

    async def verify_callback(self, request) -> tuple[bool, str | None]:
        """Verify WeChat Pay v3 callback signature."""
        signature = request.headers.get("Wechatpay-Signature", "")
        timestamp = request.headers.get("Wechatpay-Timestamp", "")
        nonce = request.headers.get("Wechatpay-Nonce", "")

        body_bytes = await request.body()
        body = await request.json()

        if not _verify_wechat_signature(body_bytes, signature, timestamp, nonce):
            return False, None

        order_number = body.get("out_trade_no")
        trade_state = body.get("trade_state", "")
        if trade_state != "SUCCESS":
            return False, None

        return True, order_number

    async def query_order(self, order_number: str) -> OrderStatus | None:
        """Query WeChat Pay for order status.  Not yet implemented."""
        return None


def _verify_wechat_signature(body: bytes, signature: str, timestamp: str, nonce: str) -> bool:
    """Verify WeChat Pay v3 signature.

    In development mode, signature verification can be explicitly disabled,
    but this is logged as a warning. In production, verification is always enforced.
    """
    if settings.env == "development" and not settings.payment_verify_signature:
        logger.warning("PAYMENT SIGNATURE VERIFICATION DISABLED — dev mode only")
        return True

    if not signature or not timestamp or not nonce:
        return False

    if not settings.wechat_api_v3_key:
        logger.error("wechat_api_v3_key not configured, cannot verify signature")
        return False

    # WeChat Pay v3 signature: HMAC-SHA256(timestamp + nonce + body, api_v3_key)
    message = f"{timestamp}\n{nonce}\n{body.decode('utf-8') if isinstance(body, bytes) else body}\n"
    expected = hmac.new(
        settings.wechat_api_v3_key.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature, expected)

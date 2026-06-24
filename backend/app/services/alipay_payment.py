"""Alipay payment provider — stub implementation.

This stub validates the provider interface and contains the signature
verification logic migrated from ``payments.py``.  To activate real
Alipay integration, implement ``create_order()`` using the
``alipay-sdk-python`` package and configure the required settings.
"""

import base64

import structlog
from fastapi import Request

from app.core.config import get_settings
from app.models.order import OrderStatus
from app.services.payment_provider import PaymentProvider

logger = structlog.get_logger()
settings = get_settings()


class AlipayPaymentProvider(PaymentProvider):
    """Alipay Trade Page Pay provider (stub)."""

    async def create_order(self, order_number: str, amount: int, plan: str, **kwargs) -> str:
        """Create an Alipay order.  Not yet implemented."""
        raise NotImplementedError(
            "Alipay integration not yet configured. "
            "Set default_payment_provider='mock' in settings, or implement "
            "AlipayPaymentProvider.create_order() with the alipay-sdk-python package."
        )

    async def verify_callback(self, request: Request) -> tuple[bool, str | None]:
        """Verify Alipay RSA2 callback signature."""
        body = await request.form()
        params = dict(body)

        if not _verify_alipay_signature(params):
            return False, None

        order_number = params.get("out_trade_no")
        trade_status = params.get("trade_status", "")
        if trade_status != "TRADE_SUCCESS":
            return False, None

        return True, order_number

    async def query_order(self, order_number: str) -> OrderStatus | None:
        """Query Alipay for order status.  Not yet implemented."""
        return None


def _verify_alipay_signature(params: dict) -> bool:
    """Verify Alipay RSA2 signature.

    In development mode, signature verification can be explicitly disabled
    with PAYMENT_VERIFY_SIGNATURE=False, but this is logged as a warning.
    In production, verification is always enforced.
    """
    if settings.env == "development" and not settings.payment_verify_signature:
        logger.warning("PAYMENT SIGNATURE VERIFICATION DISABLED — dev mode only")
        return True

    sign = params.get("sign")
    if not sign:
        return False

    # Build the string to verify (sorted params excluding sign and sign_type)
    verify_params = {k: v for k, v in params.items() if k not in ("sign", "sign_type") and v is not None and v != ""}
    sorted_params = sorted(verify_params.items())
    content = "&".join(f"{k}={v}" for k, v in sorted_params)

    if not settings.alipay_public_key:
        logger.error("alipay_public_key not configured, cannot verify signature")
        return False

    # RSA2 (SHA256withRSA) verification
    try:
        from Crypto.Hash import SHA256
        from Crypto.PublicKey import RSA
        from Crypto.Signature import PKCS1_v1_5

        key = RSA.import_key(settings.alipay_public_key)
        h = SHA256.new(content.encode("utf-8"))
        verifier = PKCS1_v1_5.new(key)
        return verifier.verify(h, base64.b64decode(sign))
    except Exception:
        logger.exception("alipay signature verification failed")
        return False

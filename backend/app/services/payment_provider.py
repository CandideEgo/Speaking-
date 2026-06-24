"""Abstract payment provider interface + factory.

Each payment gateway (Alipay, WeChat Pay, Mock) implements this interface.
The router uses ``get_payment_provider()`` to obtain the correct provider
based on configuration.

**PLAN_DURATIONS** maps plan identifiers to their duration in days.
This is used by callback handlers to set ``plan_expires_at`` on successful
payment — the critical bug fix from Phase 2a.
"""

from abc import ABC, abstractmethod

from fastapi import Request

from app.models.order import OrderStatus

# ---------------------------------------------------------------------------
# Plan definitions registry
# ---------------------------------------------------------------------------
# Amounts are in cents/fen (smallest currency unit).
PLAN_DEFINITIONS: dict[str, dict] = {
    "pro_monthly": {
        "price": 3900,  # ¥39.00 in fen
        "name": "Monthly Pro",
    },
    "pro_yearly": {
        "price": 29900,  # ¥299.00 in fen
        "name": "Yearly Pro",
    },
}

# Duration in days for each plan — used to compute plan_expires_at.
PLAN_DURATIONS: dict[str, int] = {
    "pro_monthly": 30,
    "pro_yearly": 365,
}


class PaymentProvider(ABC):
    """Abstract base class for payment gateway integrations."""

    @abstractmethod
    async def create_order(self, order_number: str, amount: int, plan: str, **kwargs) -> str:
        """Create an order on the payment platform and return the payment URL.

        Returns:
            The URL the user should visit to complete payment.
        """

    @abstractmethod
    async def verify_callback(self, request: Request) -> tuple[bool, str | None]:
        """Verify the callback signature from the payment platform.

        Returns:
            Tuple of (is_valid, order_number).  If verification fails,
            return (False, None).
        """

    @abstractmethod
    async def query_order(self, order_number: str) -> OrderStatus | None:
        """Query the payment platform for the current order status.

        Used for reconciliation / status polling when the callback
        hasn't arrived yet.  Return None if the platform doesn't
        support this operation.
        """


def get_payment_provider(provider_name: str | None = None) -> PaymentProvider:
    """Return the appropriate PaymentProvider instance.

    If ``provider_name`` is None, falls back to the
    ``default_payment_provider`` setting.
    """
    from app.core.config import get_settings

    settings = get_settings()
    name = provider_name or settings.default_payment_provider

    # Lazy imports to avoid circular dependencies and unnecessary loads
    if name == "alipay":
        from app.services.alipay_payment import AlipayPaymentProvider

        return AlipayPaymentProvider()
    elif name == "wechat":
        from app.services.wechat_payment import WechatPaymentProvider

        return WechatPaymentProvider()
    else:
        from app.services.mock_payment import MockPaymentProvider

        return MockPaymentProvider()

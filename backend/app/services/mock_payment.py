"""Mock payment provider for development and testing.

There is no browser redirect target: ``create_order`` returns an empty
payment URL, and developers complete the mock flow by POSTing to the
dev-only ``/api/v1/payments/mock-pay?order_id=...`` endpoint.
"""

from fastapi import Request

from app.models.order import OrderStatus
from app.services.payment_provider import PaymentProvider


class MockPaymentProvider(PaymentProvider):
    """Mock provider that delegates to the in-app mock-pay endpoint."""

    async def create_order(self, order_number: str, amount: int, plan: str, **kwargs) -> str:
        """Return no redirect URL — the mock flow is a direct POST, not a redirect."""
        return ""

    async def verify_callback(self, request: Request) -> tuple[bool, str | None, int | None]:
        """Mock callbacks are always valid in dev mode."""
        # The mock-pay endpoint doesn't use callbacks — it directly
        # processes the payment.  This method exists for interface
        # completeness and always returns True.
        return True, None, None

    async def query_order(self, order_number: str) -> OrderStatus | None:
        """Mock provider does not support order queries."""
        return None

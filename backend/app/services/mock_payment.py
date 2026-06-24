"""Mock payment provider for development and testing.

Returns a URL that points to the mock-pay endpoint, which simulates
a successful payment without contacting any real payment gateway.
"""

from fastapi import Request

from app.models.order import OrderStatus
from app.services.payment_provider import PaymentProvider


class MockPaymentProvider(PaymentProvider):
    """Mock provider that redirects to the in-app mock-pay endpoint."""

    async def create_order(self, order_number: str, amount: int, plan: str, **kwargs) -> str:
        """Return a URL to the mock-pay endpoint."""
        return f"/api/v1/payments/mock-pay?order_id={order_number}"

    async def verify_callback(self, request: Request) -> tuple[bool, str | None]:
        """Mock callbacks are always valid in dev mode."""
        # The mock-pay endpoint doesn't use callbacks — it directly
        # processes the payment.  This method exists for interface
        # completeness and always returns True.
        return True, None

    async def query_order(self, order_number: str) -> OrderStatus | None:
        """Mock provider does not support order queries."""
        return None

"""Pydantic schemas for the payment flow."""

from datetime import datetime

from pydantic import BaseModel, Field


class CreateOrderRequest(BaseModel):
    """Request body for creating a payment order."""

    plan: str = Field(..., description="Plan identifier, e.g. 'pro_monthly' or 'pro_yearly'")


class CreateOrderResponse(BaseModel):
    """Response after creating a payment order."""

    order_id: str
    amount: int
    currency: str = "CNY"
    payment_url: str


class PaymentStatusResponse(BaseModel):
    """Current user's plan/payment status."""

    plan: str
    is_pro: bool
    plan_expires_at: datetime | None = None


class OrderStatusResponse(BaseModel):
    """Status of a specific order (for frontend polling)."""

    order_id: str
    status: str
    amount: int
    plan: str
    paid_at: datetime | None = None
    created_at: datetime

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


class JinshujuPurchaseTier(BaseModel):
    """一个可购买档位（价格单位：分）。"""

    name: str
    days: int
    price_fen: int


class JinshujuPurchaseLinkResponse(BaseModel):
    """站内购买入口返回的带签名收款页链接。"""

    url: str
    expires_in_seconds: int
    tiers: list[JinshujuPurchaseTier]


class AlipayCallbackResponse(BaseModel):
    """Alipay notifies with plain text; this is our local ack envelope."""

    status: str
    message: str


class WechatCallbackResponse(BaseModel):
    """WeChat Pay v3 expects this JSON ack shape."""

    code: str
    message: str


class JinshujuWebhookResponse(BaseModel):
    """Jinshuju data-push ack (0 = accepted, 1 = accepted but defer to cron)."""

    code: int
    message: str


class MockPaymentResponse(BaseModel):
    """Development-only payment simulation result."""

    success: bool
    message: str
    redirect: str

"""Payment router — create orders, handle callbacks, check status.

Uses the abstract PaymentProvider interface so the same router works
with Mock, Alipay, or WeChat Pay backends.  The provider is selected
via the ``default_payment_provider`` setting.
"""

import uuid
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.order import Order, OrderStatus
from app.models.user import PlanType, User
from app.schemas.payment import (
    CreateOrderRequest,
    CreateOrderResponse,
    OrderStatusResponse,
    PaymentStatusResponse,
)
from app.services.payment_provider import PLAN_DEFINITIONS, PLAN_DURATIONS, get_payment_provider

logger = structlog.get_logger()
settings = get_settings()

# ICP 合规提示，payments_enabled=False 时由 create-order 返回。
PAYMENTS_DISABLED_MESSAGE = (
    "本网站为非经营性工具展示平台，不支持在线支付。请前往微信小商店购买后，使用兑换码激活 Pro 会员。"
)


def _utcnow() -> datetime:
    """Return current UTC time as a naive datetime for DB compatibility.

    PostgreSQL stores timezone-aware datetimes, but SQLite (used in tests)
    stores naive datetimes. Using naive UTC consistently avoids comparison
    errors across backends.
    """
    return datetime.now(UTC).replace(tzinfo=None)


router = APIRouter(prefix="/payments", tags=["payments"])


def _generate_order_number() -> str:
    return f"spk_{uuid.uuid4().hex[:16]}"


async def _process_successful_payment(db: AsyncSession, order: Order) -> None:
    """Shared logic for processing a successful payment.

    - Upgrades the user to Pro
    - Sets plan_expires_at based on the plan's duration
    - Marks the order as paid

    Must be called within a transaction where the order row is locked
    (with_for_update).
    """
    user_result = await db.execute(select(User).where(User.id == order.user_id).with_for_update())
    user = user_result.scalar_one_or_none()
    if user and (user.plan != PlanType.pro or user.plan_expires_at is None or user.plan_expires_at < _utcnow()):
        user.plan = PlanType.pro
        # Critical fix: set plan_expires_at based on plan duration
        duration_days = PLAN_DURATIONS.get(order.plan, 30)
        user.plan_expires_at = max(user.plan_expires_at or _utcnow(), _utcnow()) + timedelta(days=duration_days)
        logger.info(
            "user_upgraded_to_pro",
            user_id=user.id,
            plan=order.plan,
            duration_days=duration_days,
            expires_at=user.plan_expires_at.isoformat(),
        )

    order.status = OrderStatus.paid
    order.paid_at = _utcnow()
    await db.commit()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/create-order")
@rate_limit("5/minute")
async def create_order(
    request: Request,
    body: CreateOrderRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a payment order for the selected plan."""
    # ICP 合规：站内支付默认禁用，返回合规提示而非创建订单。
    if not settings.payments_enabled:
        return JSONResponse(status_code=451, content={"detail": PAYMENTS_DISABLED_MESSAGE})

    # Accept both JSON body and query param for backward compat
    plan = body.plan if body else request.query_params.get("plan", "pro_monthly")

    if current_user.plan == PlanType.pro and current_user.plan_expires_at and current_user.plan_expires_at > _utcnow():
        raise HTTPException(status_code=400, detail="Already a Pro member")

    # Validate plan against registry
    plan_def = PLAN_DEFINITIONS.get(plan)
    if not plan_def:
        valid_plans = ", ".join(sorted(PLAN_DEFINITIONS.keys()))
        raise HTTPException(
            status_code=400,
            detail=f"Invalid plan '{plan}'. Valid plans: {valid_plans}",
        )

    amount = plan_def["price"]
    order_number = _generate_order_number()

    order = Order(
        user_id=current_user.id,
        order_number=order_number,
        plan=plan,
        amount=amount,
        status=OrderStatus.pending,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    # Get payment URL from the configured provider
    provider = get_payment_provider()
    try:
        payment_url = await provider.create_order(
            order_number=order_number,
            amount=amount,
            plan=plan,
        )
    except NotImplementedError as exc:
        logger.error("payment_provider_not_implemented", error=str(exc))
        raise HTTPException(status_code=501, detail=str(exc)) from exc

    return CreateOrderResponse(
        order_id=order_number,
        amount=amount,
        currency="CNY",
        payment_url=payment_url,
    )


@router.post("/callback/alipay")
@rate_limit("30/minute")
async def alipay_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Alipay payment callback handler."""
    from app.services.alipay_payment import AlipayPaymentProvider

    provider = AlipayPaymentProvider()
    is_valid, order_number = await provider.verify_callback(request)

    if not is_valid or not order_number:
        logger.warning("alipay callback: invalid signature or missing order number")
        return {"status": "error", "message": "Invalid signature"}

    result = await db.execute(select(Order).where(Order.order_number == order_number).with_for_update())
    order = result.scalar_one_or_none()
    if not order:
        logger.warning("alipay callback: order not found", order_number=order_number)
        return {"status": "error", "message": "Order not found"}

    if order.status == OrderStatus.paid:
        return {"status": "success", "message": "Already processed"}

    await _process_successful_payment(db, order)
    return {"status": "success", "message": "OK"}


@router.post("/callback/wechat")
@rate_limit("30/minute")
async def wechat_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """WeChat Pay v3 callback handler."""
    from app.services.wechat_payment import WechatPaymentProvider

    provider = WechatPaymentProvider()
    is_valid, order_number = await provider.verify_callback(request)

    if not is_valid or not order_number:
        logger.warning("wechat callback: invalid signature or missing order number")
        return {"code": "FAIL", "message": "Invalid signature"}

    result = await db.execute(select(Order).where(Order.order_number == order_number).with_for_update())
    order = result.scalar_one_or_none()
    if not order:
        logger.warning("wechat callback: order not found", order_number=order_number)
        return {"code": "FAIL", "message": "Order not found"}

    if order.status == OrderStatus.paid:
        return {"code": "SUCCESS", "message": "Already processed"}

    await _process_successful_payment(db, order)
    return {"code": "SUCCESS", "message": "OK"}


@router.get("/status")
@rate_limit("30/minute")
async def payment_status(request: Request, current_user: User = Depends(get_current_user)):
    """Return the current user's plan/payment status."""
    return PaymentStatusResponse(
        plan=current_user.plan.value,
        is_pro=current_user.plan == PlanType.pro,
        plan_expires_at=current_user.plan_expires_at,
    )


@router.get("/order/{order_id}")
@rate_limit("30/minute")
async def get_order_status(
    request: Request,
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the status of a specific order (for frontend polling)."""
    result = await db.execute(select(Order).where(Order.order_number == order_id, Order.user_id == current_user.id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return OrderStatusResponse(
        order_id=order.order_number,
        status=order.status.value,
        amount=order.amount,
        plan=order.plan,
        paid_at=order.paid_at,
        created_at=order.created_at,
    )

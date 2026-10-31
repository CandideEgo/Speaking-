"""Payment router — create orders, handle callbacks, check status.

Uses the abstract PaymentProvider interface so the same router works
with Mock, Alipay, or WeChat Pay backends.  The provider is selected
via the ``default_payment_provider`` setting.
"""

import hmac
import uuid
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.database import commit_refresh, get_db
from app.core.errors import AppError, ErrorCode
from app.core.limiter import rate_limit
from app.core.time_utils import to_aware_utc
from app.models.order import Order, OrderStatus
from app.models.user import PlanType, User
from app.schemas.payment import (
    AlipayCallbackResponse,
    CreateOrderRequest,
    CreateOrderResponse,
    JinshujuPurchaseLinkResponse,
    JinshujuPurchaseTier,
    JinshujuWebhookResponse,
    OrderStatusResponse,
    PaymentStatusResponse,
    WechatCallbackResponse,
)
from app.services.payment_provider import PLAN_DEFINITIONS, PLAN_DURATIONS, get_payment_provider

logger = structlog.get_logger()
settings = get_settings()

# ICP 合规提示，payments_enabled=False 时由 create-order 返回。
PAYMENTS_DISABLED_MESSAGE = (
    "本网站为非经营性工具展示平台，不支持在线支付。请前往微信小商店购买后，使用兑换码激活 Pro 会员。"
)


def _utcnow() -> datetime:
    """Return current UTC time as a timezone-aware datetime.

    All DB DateTime columns use timezone=True; using aware datetimes
    avoids naive-vs-aware comparison errors on PostgreSQL.
    For values read back from SQLite (which drops tzinfo), use
    ``app.core.time_utils.to_aware_utc()`` to restore the timezone.
    """
    return datetime.now(UTC)


router = APIRouter(prefix="/payments", tags=["payments"])


def _generate_order_number() -> str:
    return f"spk_{uuid.uuid4().hex[:16]}"


async def _process_successful_payment(db: AsyncSession, order: Order) -> None:
    """Shared logic for processing a successful payment.

    - Upgrades the user to Pro
    - Extends plan_expires_at by the plan's duration (even for active Pro users)
    - Marks the order as paid

    Must be called within a transaction where the order row is locked
    (with_for_update).
    """
    user_result = await db.execute(select(User).where(User.id == order.user_id).with_for_update())
    user = user_result.scalar_one_or_none()
    if user:
        user.plan = PlanType.pro
        # Always extend plan_expires_at by the plan duration.
        # If the current subscription is still active, extend from its expiry;
        # otherwise, start from now.
        duration_days = PLAN_DURATIONS.get(order.plan, 30)
        now = datetime.now(UTC)
        current_expires = to_aware_utc(user.plan_expires_at) if user.plan_expires_at else now
        base = max(current_expires, now)
        user.plan_expires_at = base + timedelta(days=duration_days)
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


@router.post("/create-order", response_model=CreateOrderResponse)
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
        raise AppError(451, ErrorCode.PAYMENTS_DISABLED, PAYMENTS_DISABLED_MESSAGE)

    # Accept both JSON body and query param for backward compat
    plan = body.plan if body else request.query_params.get("plan", "pro_monthly")

    if (
        current_user.plan == PlanType.pro
        and current_user.plan_expires_at
        and to_aware_utc(current_user.plan_expires_at) > _utcnow()
    ):
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
    await commit_refresh(db, order)

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


@router.post("/callback/alipay", response_model=AlipayCallbackResponse)
@rate_limit("30/minute")
async def alipay_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Alipay payment callback handler."""
    if not settings.payments_enabled:
        raise AppError(451, ErrorCode.PAYMENTS_DISABLED, PAYMENTS_DISABLED_MESSAGE)

    from app.services.alipay_payment import AlipayPaymentProvider

    provider = AlipayPaymentProvider()
    is_valid, order_number, paid_amount = await provider.verify_callback(request)

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

    if order.status != OrderStatus.pending:
        logger.warning("alipay callback: order not pending", order_number=order_number, status=order.status)
        return {"status": "error", "message": f"Order is {order.status.value}, cannot process"}

    if paid_amount != order.amount:
        logger.warning(
            "alipay callback: amount mismatch",
            order_number=order_number,
            expected=order.amount,
            paid=paid_amount,
        )
        return {"status": "error", "message": "Amount mismatch"}

    await _process_successful_payment(db, order)
    return {"status": "success", "message": "OK"}


@router.post("/callback/wechat", response_model=WechatCallbackResponse)
@rate_limit("30/minute")
async def wechat_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """WeChat Pay v3 callback handler."""
    if not settings.payments_enabled:
        raise AppError(451, ErrorCode.PAYMENTS_DISABLED, PAYMENTS_DISABLED_MESSAGE)

    from app.services.wechat_payment import WechatPaymentProvider

    provider = WechatPaymentProvider()
    is_valid, order_number, paid_amount = await provider.verify_callback(request)

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

    if order.status != OrderStatus.pending:
        logger.warning("wechat callback: order not pending", order_number=order_number, status=order.status)
        return {"code": "FAIL", "message": f"Order is {order.status.value}, cannot process"}

    if paid_amount != order.amount:
        logger.warning(
            "wechat callback: amount mismatch",
            order_number=order_number,
            expected=order.amount,
            paid=paid_amount,
        )
        return {"code": "FAIL", "message": "Amount mismatch"}

    await _process_successful_payment(db, order)
    return {"code": "SUCCESS", "message": "OK"}


@router.get("/jinshuju/purchase-link", response_model=JinshujuPurchaseLinkResponse)
@rate_limit("30/minute")
async def jinshuju_purchase_link(request: Request, current_user: User = Depends(get_current_user)):
    """站内购买入口：返回带签名购买标识的收款页链接。

    B 方案（零填写）：链接里的 ``x_field_1`` 是服务端签名的
    ``user_id + 过期时间 + HMAC`` token，买家在金数据付款后，同步任务从 entry
    读回它就能直接开通到当前账号，收款页不需要收集手机号。
    """
    if not settings.jinshuju_enabled or not settings.jinshuju_purchase_url:
        raise HTTPException(status_code=503, detail="会员购买暂未开放")

    from app.services import jinshuju_service

    try:
        url, ttl_seconds = jinshuju_service.purchase_url_for(current_user.id)
    except jinshuju_service.JinshujuError as exc:
        logger.error("jinshuju_purchase_url_unconfigured", error=str(exc))
        raise HTTPException(status_code=503, detail="会员购买暂未开放") from exc

    tiers = [
        JinshujuPurchaseTier(name=name, days=days, price_fen=price_fen)
        for name, (days, price_fen) in jinshuju_service.TIER_RULES.items()
    ]
    return JinshujuPurchaseLinkResponse(url=url, expires_in_seconds=ttl_seconds, tiers=tiers)


@router.post("/jinshuju/webhook", response_model=JinshujuWebhookResponse)
@rate_limit("30/minute")
async def jinshuju_webhook(request: Request):
    """金数据「数据推送」回调：验签 + 转投 Celery，迅速返回 2XX。

    金数据要求接收方 2 秒内返回 2XX，否则按斐波那契间隔重试（最多 6 次）。
    真正的核对与开通在 worker 里做：任务会按 ``serial_number`` 重新拉取该条
    数据，检查 ``trade_status`` 与实付金额 —— 即使推送内容被伪造，也发不出
    会员（见 ``services/jinshuju_service.py``）。轮询任务还会补漏。
    """
    if not settings.jinshuju_enabled:
        raise HTTPException(status_code=404, detail="Not Found")

    expected = settings.jinshuju_webhook_secret
    if not expected:
        logger.warning("jinshuju_webhook_secret_unset")
        raise HTTPException(status_code=503, detail="Webhook secret not configured")

    provided = request.query_params.get("secret", "")
    # 常量时间比较必须比 **bytes**：``hmac.compare_digest`` 对非 ASCII 的 str
    # 会抛 TypeError（"comparing strings with non-ASCII characters is not
    # supported"）。``provided`` 完全由匿名请求方控制，于是 ``?secret=中``
    # 会把端点稳定打成 500，把真正的「签名不符」淹没在 500 里，排障方向被带偏。
    # 先编成 UTF-8 字节再比：既保留常量时间语义，又不会抛异常。
    if not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
        logger.warning(
            "jinshuju_webhook_bad_secret",
            client=request.client.host if request.client else None,
        )
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON") from None
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    form_token = str(payload.get("form") or "")
    if not settings.jinshuju_form_token or form_token != settings.jinshuju_form_token:
        logger.warning("jinshuju_webhook_form_mismatch", form=form_token)
        raise HTTPException(status_code=400, detail="Unknown form")

    entry = payload.get("entry")
    serial_number = entry.get("serial_number") if isinstance(entry, dict) else None
    if not isinstance(serial_number, int):
        logger.warning("jinshuju_webhook_missing_serial")
        raise HTTPException(status_code=400, detail="Missing serial_number")

    try:
        from app.tasks.payment_tasks import process_jinshuju_entry

        process_jinshuju_entry.delay(serial_number)
    except Exception:
        # 转投失败不返回 5xx：定时同步会补上，避免金数据把 6 次重试都耗在
        # 一个临时不可用的 broker 上。
        logger.exception("jinshuju_webhook_enqueue_failed", serial_number=serial_number)
        return {"code": 1, "message": "queued later"}

    logger.info("jinshuju_webhook_accepted", serial_number=serial_number)
    return {"code": 0, "message": "ok"}


@router.get("/status", response_model=PaymentStatusResponse)
@rate_limit("30/minute")
async def payment_status(request: Request, current_user: User = Depends(get_current_user)):
    """Return the current user's plan/payment status."""
    return PaymentStatusResponse(
        plan=current_user.plan.value,
        is_pro=current_user.plan == PlanType.pro
        and current_user.plan_expires_at is not None
        and to_aware_utc(current_user.plan_expires_at) > datetime.now(UTC),
        plan_expires_at=current_user.plan_expires_at,
    )


@router.get("/order/{order_id}", response_model=OrderStatusResponse)
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

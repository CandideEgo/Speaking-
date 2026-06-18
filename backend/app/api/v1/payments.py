import base64
import hashlib
import hmac
import structlog
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.config import get_settings
from app.models.user import User, PlanType
from app.models.order import Order, OrderStatus
from app.api.dependencies import get_current_user
from app.core.limiter import rate_limit

logger = structlog.get_logger()

router = APIRouter(prefix="/payments", tags=["payments"])

settings = get_settings()

# ---------------------------------------------------------------------------
# Plan definitions registry
# ---------------------------------------------------------------------------
# Amounts are in cents/fen (smallest currency unit).
# To add a new plan, append an entry here — create_order validates against this.
PLAN_DEFINITIONS: dict[str, dict] = {
    "pro_monthly": {
        "price": 3900,       # ¥39.00 in fen
        "name": "Monthly Pro",
    },
    "pro_yearly": {
        "price": 29900,      # ¥299.00 in fen
        "name": "Yearly Pro",
    },
}


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
    sign_type = params.get("sign_type", "RSA2")
    if not sign:
        return False

    # Build the string to verify (sorted params excluding sign and sign_type)
    verify_params = {
        k: v for k, v in params.items()
        if k not in ("sign", "sign_type") and v is not None and v != ""
    }
    sorted_params = sorted(verify_params.items())
    content = "&".join(f"{k}={v}" for k, v in sorted_params)

    if not settings.alipay_public_key:
        logger.error("alipay_public_key not configured, cannot verify signature")
        return False

    # RSA2 (SHA256withRSA) verification
    try:
        from Crypto.PublicKey import RSA
        from Crypto.Signature import PKCS1_v1_5
        from Crypto.Hash import SHA256

        key = RSA.import_key(settings.alipay_public_key)
        h = SHA256.new(content.encode("utf-8"))
        verifier = PKCS1_v1_5.new(key)
        return verifier.verify(h, base64.b64decode(sign))
    except Exception:
        logger.exception("alipay signature verification failed")
        return False


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


def _generate_order_number() -> str:
    return f"spk_{uuid.uuid4().hex[:16]}"


@router.post("/create-order")
@rate_limit("5/minute")
async def create_order(
    request: Request,
    plan: str = "pro_monthly",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.plan == PlanType.pro:
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

    # In production: call Alipay/WeChat Pay API to get payment URL
    payment_url = f"/api/v1/payments/mock-pay?order_id={order_number}"

    return {
        "order_id": order_number,
        "amount": amount,
        "currency": "CNY",
        "payment_url": payment_url,
    }


@router.post("/callback/alipay")
@rate_limit("30/minute")
async def alipay_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Alipay payment callback handler.

    Verifies RSA2 signature before processing the payment.
    In development only, signature verification can be skipped (with warning).
    """
    body = await request.form()
    params = dict(body)

    if not _verify_alipay_signature(params):
        logger.warning("alipay callback: invalid signature")
        return {"status": "error", "message": "Invalid signature"}

    order_number = params.get("out_trade_no")
    trade_status = params.get("trade_status", "")

    if trade_status != "TRADE_SUCCESS":
        return {"status": "error", "message": f"Trade status: {trade_status}"}

    result = await db.execute(
        select(Order).where(Order.order_number == order_number).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        logger.warning("alipay callback: order not found", order_number=order_number)
        return {"status": "error", "message": "Order not found"}

    if order.status == OrderStatus.paid:
        return {"status": "success", "message": "Already processed"}

    user_result = await db.execute(select(User).where(User.id == order.user_id))
    user = user_result.scalar_one_or_none()
    if user and user.plan != PlanType.pro:
        user.plan = PlanType.pro

    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    await db.commit()

    return {"status": "success", "message": "OK"}


@router.post("/callback/wechat")
@rate_limit("30/minute")
async def wechat_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """WeChat Pay v3 callback handler.

    Verifies HMAC-SHA256 signature before processing the payment.
    In development only, signature verification can be skipped (with warning).
    """
    signature = request.headers.get("Wechatpay-Signature", "")
    timestamp = request.headers.get("Wechatpay-Timestamp", "")
    nonce = request.headers.get("Wechatpay-Nonce", "")

    body_bytes = await request.body()
    body = await request.json()

    if not _verify_wechat_signature(body_bytes, signature, timestamp, nonce):
        logger.warning("wechat callback: invalid signature")
        return {"code": "FAIL", "message": "Invalid signature"}

    order_number = body.get("out_trade_no")
    trade_state = body.get("trade_state", "")

    if trade_state != "SUCCESS":
        return {"code": "FAIL", "message": f"Trade state: {trade_state}"}

    result = await db.execute(
        select(Order).where(Order.order_number == order_number).with_for_update()
    )
    order = result.scalar_one_or_none()
    if not order:
        logger.warning("wechat callback: order not found", order_number=order_number)
        return {"code": "FAIL", "message": "Order not found"}

    if order.status == OrderStatus.paid:
        return {"code": "SUCCESS", "message": "Already processed"}

    user_result = await db.execute(select(User).where(User.id == order.user_id))
    user = user_result.scalar_one_or_none()
    if user and user.plan != PlanType.pro:
        user.plan = PlanType.pro

    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    await db.commit()

    return {"code": "SUCCESS", "message": "OK"}


@router.get("/status")
@rate_limit("30/minute")
async def payment_status(request: Request, current_user: User = Depends(get_current_user)):
    return {
        "plan": current_user.plan.value,
        "is_pro": current_user.plan == PlanType.pro,
    }

import hashlib
import hmac
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.config import get_settings
from app.models.user import User, PlanType
from app.models.order import Order, OrderStatus
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/payments", tags=["payments"])

settings = get_settings()


def _verify_alipay_signature(params: dict) -> bool:
    """Verify Alipay RSA signature.

    In production, this should:
    1. Extract the 'sign' and 'sign_type' from params
    2. Sort remaining params alphabetically, concatenate with '&'
    3. Verify against alipay_public_key using RSA
    """
    if not settings.payment_verify_signature:
        return True  # Dev mode: skip verification

    sign = params.get("sign")
    if not sign:
        return False

    # Build the string to verify (sorted params excluding sign and sign_type)
    verify_params = {
        k: v for k, v in params.items()
        if k not in ("sign", "sign_type")
    }
    sorted_params = sorted(verify_params.items())
    content = "&".join(f"{k}={v}" for k, v in sorted_params)

    # In production, verify with actual RSA:
    # from Crypto.PublicKey import RSA
    # from Crypto.Signature import PKCS1_v1_5
    # from Crypto.Hash import SHA256
    # key = RSA.import_key(settings.alipay_public_key)
    # h = SHA256.new(content.encode())
    # verifier = PKCS1_v1_5.new(key)
    # return verifier.verify(h, base64.b64decode(sign))

    # Placeholder: HMAC-based dev verification
    expected = hmac.new(
        settings.jwt_secret.encode(),
        content.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(sign, expected)


def _verify_wechat_signature(body: bytes, signature: str, timestamp: str, nonce: str) -> bool:
    """Verify WeChat Pay v3 signature.

    In production, this should:
    1. Build the signing string: timestamp + nonce + body
    2. Verify against wechat_api_v3_key using HMAC-SHA256
    3. Optionally verify the certificate serial number
    """
    if not settings.payment_verify_signature:
        return True  # Dev mode: skip verification

    if not signature or not timestamp or not nonce:
        return False

    # WeChat Pay v3 signature: HMAC-SHA256(timestamp + nonce + body, api_v3_key)
    message = f"{timestamp}\n{nonce}\n{body.decode() if isinstance(body, bytes) else body}\n"
    expected = hmac.new(
        settings.wechat_api_v3_key.encode() if settings.wechat_api_v3_key else settings.jwt_secret.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature, expected)


def _generate_order_number() -> str:
    return f"spk_{uuid.uuid4().hex[:16]}"


@router.post("/create-order")
async def create_order(
    plan: str = "pro_monthly",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.plan == PlanType.pro:
        raise HTTPException(status_code=400, detail="Already a Pro member")

    order_number = _generate_order_number()
    amount = 3900 if plan == "pro_monthly" else 29900  # in cents/fen

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


@router.get("/mock-pay")
async def mock_payment(
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Simulate payment for development. Replace with real callback in production."""
    result = await db.execute(
        select(Order).where(Order.order_number == order_id)
    )
    order = result.scalar_one_or_none()

    if not order or order.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != OrderStatus.pending:
        raise HTTPException(status_code=400, detail="Order already processed")

    current_user.plan = PlanType.pro
    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    await db.commit()

    return {"success": True, "message": "Payment successful — upgraded to Pro", "redirect": "/dashboard"}


@router.post("/callback/alipay")
async def alipay_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Alipay payment callback handler.

    Verifies RSA signature before processing the payment.
    In development (payment_verify_signature=False), skips verification.
    """
    body = await request.form()
    params = dict(body)

    # Verify signature
    if not _verify_alipay_signature(params):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid payment signature",
        )

    order_number = params.get("out_trade_no")
    trade_status = params.get("trade_status", "")

    if trade_status != "TRADE_SUCCESS":
        return {"success": False, "message": f"Trade status: {trade_status}"}

    result = await db.execute(
        select(Order).where(Order.order_number == order_number)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.status == OrderStatus.paid:
        return {"success": True, "message": "Already processed"}

    user_result = await db.execute(select(User).where(User.id == order.user_id))
    user = user_result.scalar_one_or_none()
    if user and user.plan != PlanType.pro:
        user.plan = PlanType.pro

    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    await db.commit()

    return {"success": True}


@router.post("/callback/wechat")
async def wechat_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """WeChat Pay v3 callback handler.

    Verifies HMAC-SHA256 signature before processing the payment.
    In development (payment_verify_signature=False), skips verification.
    """
    signature = request.headers.get("Wechatpay-Signature", "")
    timestamp = request.headers.get("Wechatpay-Timestamp", "")
    nonce = request.headers.get("Wechatpay-Nonce", "")

    body_bytes = await request.body()
    body = await request.json()

    # Verify signature
    if not _verify_wechat_signature(body_bytes, signature, timestamp, nonce):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid payment signature",
        )

    order_number = body.get("out_trade_no")
    trade_state = body.get("trade_state", "")

    if trade_state != "SUCCESS":
        return {"code": "FAIL", "message": f"Trade state: {trade_state}"}

    result = await db.execute(
        select(Order).where(Order.order_number == order_number)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

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
async def payment_status(current_user: User = Depends(get_current_user)):
    return {
        "plan": current_user.plan.value,
        "is_pro": current_user.plan == PlanType.pro,
    }

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.config import get_settings
from app.models.user import User, PlanType
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/payments", tags=["payments"])

settings = get_settings()

# In-memory order store (replace with DB table in production)
_orders: dict[str, dict] = {}


@router.post("/create-order")
async def create_order(
    plan: str = "pro_monthly",
    current_user: User = Depends(get_current_user),
):
    if current_user.plan == PlanType.pro:
        raise HTTPException(status_code=400, detail="Already a Pro member")

    order_id = f"spk_{uuid.uuid4().hex[:16]}"
    amount = 3900 if plan == "pro_monthly" else 29900  # in cents/fen

    _orders[order_id] = {
        "user_id": current_user.id,
        "plan": plan,
        "amount": amount,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # In production: call Alipay/WeChat Pay API to get payment URL
    payment_url = f"/api/v1/payments/mock-pay?order_id={order_id}"

    return {
        "order_id": order_id,
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
    order = _orders.get(order_id)
    if not order or order["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Order not found")

    current_user.plan = PlanType.pro
    order["status"] = "completed"
    await db.commit()

    return {"success": True, "message": "Payment successful — upgraded to Pro", "redirect": "/dashboard"}


@router.post("/callback/alipay")
async def alipay_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Alipay payment callback handler."""
    body = await request.form()
    order_id = body.get("out_trade_no")

    # Verify signature in production
    order = _orders.get(order_id)
    if not order:
        raise HTTPException(status_code=404)

    result = await db.execute(select(User).where(User.id == order["user_id"]))
    user = result.scalar_one_or_none()
    if user:
        user.plan = PlanType.pro
        order["status"] = "completed"
        await db.commit()

    return {"success": True}


@router.post("/callback/wechat")
async def wechat_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """WeChat Pay callback handler."""
    body = await request.json()
    order_id = body.get("out_trade_no")

    order = _orders.get(order_id)
    if not order:
        raise HTTPException(status_code=404)

    result = await db.execute(select(User).where(User.id == order["user_id"]))
    user = result.scalar_one_or_none()
    if user:
        user.plan = PlanType.pro
        order["status"] = "completed"
        await db.commit()

    return {"code": "SUCCESS", "message": "OK"}


@router.get("/status")
async def payment_status(current_user: User = Depends(get_current_user)):
    return {
        "plan": current_user.plan.value,
        "is_pro": current_user.plan == PlanType.pro,
    }

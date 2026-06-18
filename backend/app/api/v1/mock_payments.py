"""Mock payment endpoint — development / test only.

This module is intentionally excluded from the production router.
It is included conditionally in main.py only when settings.env == "development".
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.order import Order, OrderStatus
from app.models.user import User, PlanType

import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/payments", tags=["payments-mock"])

settings = get_settings()


@router.get("/mock-pay")
@rate_limit("5/minute")
async def mock_payment(
    request: Request,
    order_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Simulate payment for development. DISABLED in production."""
    if settings.env not in ("development", "testing"):
        raise HTTPException(status_code=404, detail="Not found")

    result = await db.execute(
        select(Order).where(Order.order_number == order_id).with_for_update()
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

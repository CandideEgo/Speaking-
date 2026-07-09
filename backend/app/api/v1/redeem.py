from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import _to_aware_utc, get_admin_user, get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.redeem import RedeemCode, RedeemStatus
from app.models.user import PlanType, User
from app.schemas.pagination import has_more, paginated
from app.schemas.redeem import (
    RedeemCodeGenerate,
    RedeemCodeRedeem,
    RedeemCodeResponse,
    RedeemRefundResponse,
    RedeemResponse,
    RedeemRevokeRequest,
    RedeemRevokeResponse,
)
from app.services import admin_service

settings = get_settings()


def _utcnow() -> datetime:
    """Return current UTC time as a timezone-aware datetime."""
    return datetime.now(UTC)


router = APIRouter(prefix="/redeem-codes", tags=["redeem-codes"])


@router.post("/generate", response_model=list[RedeemCodeResponse])
@rate_limit("5/minute")
async def generate_codes(
    request: Request,
    data: RedeemCodeGenerate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    """Admin: generate a batch of redeem codes.

    Each code's ``expires_at`` is set to ``now + redeem_code_unused_expiry_days``
    so the expire-unused beat can flip it to ``expired`` later (ADR-0007).
    """
    now = _utcnow()
    expires_at = now + timedelta(days=settings.redeem_code_unused_expiry_days)
    codes = []
    for _ in range(data.count):
        code = RedeemCode(
            plan=data.plan,
            duration_days=data.duration_days,
            batch_label=data.batch_label,
            expires_at=expires_at,
        )
        db.add(code)
        codes.append(code)

    await db.commit()
    for c in codes:
        await db.refresh(c)
    return codes


@router.get("/export")
@rate_limit("10/minute")
async def export_codes(
    request: Request,
    batch_label: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    """Admin: export unused codes as CSV text (for the mini-shop)."""
    stmt = select(RedeemCode).where(RedeemCode.status == RedeemStatus.unused)
    if batch_label:
        stmt = stmt.where(RedeemCode.batch_label == batch_label)
    stmt = stmt.order_by(RedeemCode.created_at.desc())

    result = await db.execute(stmt)
    codes = result.scalars().all()

    lines = ["code,plan,duration_days,batch_label,created_at,expires_at"]
    for c in codes:
        lines.append(
            f"{c.code},{c.plan},{c.duration_days},{c.batch_label or ''},"
            f"{c.created_at.isoformat()},{c.expires_at.isoformat() if c.expires_at else ''}"
        )

    return {"csv": "\n".join(lines), "total": len(codes)}


@router.get("")
@rate_limit("30/minute")
async def list_codes(
    request: Request,
    status: RedeemStatus | None = Query(None),
    batch_label: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    """Admin: list redeem codes (paginated), optionally filtered by status."""
    offset = (page - 1) * page_size
    stmt = select(RedeemCode)
    if status is not None:
        stmt = stmt.where(RedeemCode.status == status)
    if batch_label:
        stmt = stmt.where(RedeemCode.batch_label == batch_label)
    stmt = stmt.order_by(RedeemCode.created_at.desc()).offset(offset).limit(page_size)

    result = await db.execute(stmt)
    items = result.scalars().all()

    count_stmt = select(func.count(RedeemCode.id))
    if status is not None:
        count_stmt = count_stmt.where(RedeemCode.status == status)
    if batch_label:
        count_stmt = count_stmt.where(RedeemCode.batch_label == batch_label)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    return paginated(
        [RedeemCodeResponse.model_validate(c) for c in items],
        page=page,
        page_size=page_size,
        has_more=has_more(total, page, page_size),
    )


@router.post("/redeem", response_model=RedeemResponse)
@rate_limit("5/minute")
async def redeem_code(
    request: Request,
    data: RedeemCodeRedeem,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Redeem a code to upgrade the account to Pro (ADR-0007).

    Only ``unused`` codes can be redeemed; redeemed/revoked/expired each get a
    friendly error. Stacks on an active Pro membership (max(current, now) +
    duration_days).
    """
    code_str = data.code.strip().upper()

    result = await db.execute(select(RedeemCode).where(RedeemCode.code == code_str).with_for_update())
    code = result.scalar_one_or_none()

    if not code:
        raise HTTPException(status_code=404, detail="Invalid redeem code")
    if code.status != RedeemStatus.unused:
        msg = {
            RedeemStatus.redeemed: "This code has already been used",
            RedeemStatus.revoked: "This code has been revoked",
            RedeemStatus.expired: "This code has expired",
        }.get(code.status, "This code is no longer valid")
        raise HTTPException(status_code=400, detail=msg)

    # Apply the code.
    code.status = RedeemStatus.redeemed
    code.used_by = current_user.id
    code.used_at = _utcnow()

    # Lock the User row before modifying to prevent race conditions.
    user_result = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    current_user = user_result.scalar_one()

    current_user.plan = PlanType.pro
    new_expires: datetime | None = None
    if code.duration_days and code.duration_days > 0:
        now = _utcnow()
        current_expires = _to_aware_utc(current_user.plan_expires_at) if current_user.plan_expires_at else now
        new_expires = max(current_expires, now) + timedelta(days=code.duration_days)
        current_user.plan_expires_at = new_expires

    await db.commit()

    return RedeemResponse(
        success=True,
        message=f"Successfully upgraded to Pro! ({code.duration_days} days)",
        plan="pro",
        plan_expires_at=new_expires,
    )


@router.post("/{code_id}/revoke", response_model=RedeemRevokeResponse)
@rate_limit("10/minute")
async def revoke_code(
    request: Request,
    code_id: str,
    payload: RedeemRevokeRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    """Admin: void an *unused* code (leak / error). Terminal -> revoked.

    Refunding an already-redeemed code (clawing back the granted time) is a
    separate operation: ``POST /{code_id}/refund``.
    """
    if payload is None:
        payload = RedeemRevokeRequest()
    try:
        code = await admin_service.revoke_redeem_code(db, code_id, payload.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return RedeemRevokeResponse(
        success=True,
        message=f"Code {code.code} revoked (reason: {code.revoked_reason.value if code.revoked_reason else 'unknown'})",
        code_id=code.id,
        status=code.status,
    )


@router.post("/{code_id}/refund", response_model=RedeemRefundResponse)
@rate_limit("10/minute")
async def refund_code(
    request: Request,
    code_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    """Admin: refund clawback on a redeemed code (ADR-0007).

    Atomic within one transaction: code -> revoked(reason=refund) + claw back
    ``duration_days`` from the user's ``plan_expires_at`` (not below now) +
    downgrade to free if expired. Full refund == full clawback.
    """
    try:
        code, user = await admin_service.refund_redeem_code(db, code_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return RedeemRefundResponse(
        success=True,
        message=f"Refund processed: clawed back {code.duration_days} days from user {user.id}",
        code_id=code.id,
        user_id=user.id,
        plan=user.plan.value,
        plan_expires_at=user.plan_expires_at,
    )

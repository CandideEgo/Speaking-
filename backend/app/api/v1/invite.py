from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import _to_aware_utc, get_admin_user, get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.invite import InviteCode
from app.models.user import PlanType, User
from app.schemas.invite import (
    InviteCodeGenerate,
    InviteCodeRedeem,
    InviteCodeResponse,
    RedeemResponse,
)
from app.schemas.pagination import has_more


def _utcnow() -> datetime:
    """Return current UTC time as a naive datetime for DB compatibility."""
    return datetime.now(UTC).replace(tzinfo=None)


router = APIRouter(prefix="/invite-codes", tags=["invite-codes"])


@router.post("/generate", response_model=list[InviteCodeResponse])
@rate_limit("5/minute")
async def generate_codes(
    request: Request,
    data: InviteCodeGenerate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    """Admin: generate a batch of invite codes."""
    codes = []
    for _ in range(data.count):
        from app.models.invite import generate_code

        code = InviteCode(
            plan=data.plan,
            duration_days=data.duration_days,
            batch_label=data.batch_label,
        )
        # ensure uniqueness
        while True:
            existing = await db.execute(select(InviteCode).where(InviteCode.code == code.code))
            if not existing.scalar_one_or_none():
                break
            code.code = generate_code()
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
    """Admin: export unused codes as CSV text."""
    stmt = select(InviteCode).where(InviteCode.is_used == False)
    if batch_label:
        stmt = stmt.where(InviteCode.batch_label == batch_label)
    stmt = stmt.order_by(InviteCode.created_at.desc())

    result = await db.execute(stmt)
    codes = result.scalars().all()

    lines = ["code,plan,duration_days,batch_label,created_at"]
    for c in codes:
        lines.append(f"{c.code},{c.plan},{c.duration_days},{c.batch_label or ''},{c.created_at.isoformat()}")

    return {"csv": "\n".join(lines), "total": len(codes)}


@router.get("")
@rate_limit("30/minute")
async def list_codes(
    request: Request,
    used: bool | None = Query(None),
    batch_label: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_admin_user),
):
    """Admin: list invite codes (paginated)."""
    offset = (page - 1) * page_size
    stmt = select(InviteCode)
    if used is not None:
        stmt = stmt.where(InviteCode.is_used == used)
    if batch_label:
        stmt = stmt.where(InviteCode.batch_label == batch_label)
    stmt = stmt.order_by(InviteCode.created_at.desc()).offset(offset).limit(page_size)

    result = await db.execute(stmt)
    items = result.scalars().all()

    # Count total for has_more
    from sqlalchemy import func

    count_stmt = select(func.count(InviteCode.id))
    if used is not None:
        count_stmt = count_stmt.where(InviteCode.is_used == used)
    if batch_label:
        count_stmt = count_stmt.where(InviteCode.batch_label == batch_label)
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    return {
        "items": [InviteCodeResponse.model_validate(c) for c in items],
        "page": page,
        "page_size": page_size,
        "has_more": has_more(total, page, page_size),
    }


@router.post("/redeem", response_model=RedeemResponse)
@rate_limit("5/minute")
async def redeem_code(
    request: Request,
    data: InviteCodeRedeem,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Redeem an invite code to upgrade account to Pro."""
    code_str = data.code.strip().upper()

    result = await db.execute(select(InviteCode).where(InviteCode.code == code_str).with_for_update())
    code = result.scalar_one_or_none()

    if not code:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    if code.is_used:
        raise HTTPException(status_code=400, detail="This code has already been used")

    # Apply the code
    code.is_used = True
    code.used_by = current_user.id
    code.used_at = _utcnow()

    # Lock the User row before modifying to prevent race conditions
    user_result = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    current_user = user_result.scalar_one()

    current_user.plan = PlanType.pro
    if code.duration_days and code.duration_days > 0:
        current_expires = _to_aware_utc(current_user.plan_expires_at) if current_user.plan_expires_at else _utcnow()
        current_user.plan_expires_at = max(current_expires, _utcnow()) + timedelta(days=code.duration_days)

    await db.commit()

    return RedeemResponse(
        success=True,
        message=f"Successfully upgraded to Pro! ({code.duration_days} days)",
        plan="pro",
    )

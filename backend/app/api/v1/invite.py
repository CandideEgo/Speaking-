from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.user import User, PlanType
from app.models.invite import InviteCode
from app.schemas.invite import (
    InviteCodeGenerate,
    InviteCodeResponse,
    InviteCodeRedeem,
    RedeemResponse,
)
from app.api.dependencies import get_current_user

router = APIRouter(prefix="/invite-codes", tags=["invite-codes"])


@router.post("/generate", response_model=list[InviteCodeResponse])
async def generate_codes(
    data: InviteCodeGenerate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: generate a batch of invite codes."""
    # In production, restrict to admin role
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
            existing = await db.execute(
                select(InviteCode).where(InviteCode.code == code.code)
            )
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
async def export_codes(
    batch_label: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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


@router.get("", response_model=list[InviteCodeResponse])
async def list_codes(
    used: bool | None = Query(None),
    batch_label: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Admin: list invite codes."""
    stmt = select(InviteCode)
    if used is not None:
        stmt = stmt.where(InviteCode.is_used == used)
    if batch_label:
        stmt = stmt.where(InviteCode.batch_label == batch_label)
    stmt = stmt.order_by(InviteCode.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/redeem", response_model=RedeemResponse)
async def redeem_code(
    data: InviteCodeRedeem,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Redeem an invite code to upgrade account to Pro."""
    code_str = data.code.strip().upper()

    result = await db.execute(
        select(InviteCode).where(InviteCode.code == code_str)
    )
    code = result.scalar_one_or_none()

    if not code:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    if code.is_used:
        raise HTTPException(status_code=400, detail="This code has already been used")

    # Apply the code
    code.is_used = True
    code.used_by = current_user.id
    code.used_at = datetime.now(timezone.utc)

    current_user.plan = PlanType.pro
    # Optionally set subscription expiry based on duration_days
    # For now, just set plan to pro

    await db.commit()

    return RedeemResponse(
        success=True,
        message=f"Successfully upgraded to Pro! ({code.duration_days} days)",
        plan="pro",
    )

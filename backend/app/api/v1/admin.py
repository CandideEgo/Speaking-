"""Admin API router — all admin-only endpoints under /api/v1/admin.

This router consolidates the admin management endpoints that don't belong
in existing domain routers (videos, invite-codes, rubrics). Those keep
their admin routes in-place; this file adds the missing ones:

  - Dashboard stats
  - User management (list, ban, role change, plan grant/revoke)
  - Orders listing
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.admin import (
    AdminSettingsUpdate,
    AdminUserBanRequest,
    AdminUserPlanRequest,
    AdminUserRoleRequest,
)
from app.schemas.pagination import PaginatedResponse
from app.services import admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# GPU worker status
# ---------------------------------------------------------------------------


@router.get("/worker-status")
@rate_limit("30/minute")
async def get_worker_status(
    request: Request,
    current_user: User = Depends(get_admin_user),
):
    """Check if the local GPU worker is online (heartbeat present in Redis)."""
    from app.services.video_seed_service import is_gpu_worker_online

    online = await is_gpu_worker_online()
    return {"worker_online": online}


# ---------------------------------------------------------------------------
# Stats dashboard
# ---------------------------------------------------------------------------


@router.get("/stats")
@rate_limit("30/minute")
async def get_admin_stats(
    request: Request,
    days: int = Query(30, ge=7, le=90, description="Trend window in days"),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard KPIs, trend data, distributions, and recent activity."""
    return await admin_service.get_admin_stats(db, days=days)


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------


@router.get("/users", response_model=PaginatedResponse)
@rate_limit("30/minute")
async def list_admin_users(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: str | None = Query(None, description="Filter by role: user / admin"),
    plan: str | None = Query(None, description="Filter by plan: free / pro"),
    keyword: str | None = Query(None, description="Search name or phone"),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List users with aggregated stats. Admin only."""
    return await admin_service.list_admin_users(
        db, page=page, page_size=page_size, role=role, plan=plan, keyword=keyword
    )


@router.patch("/users/{user_id}/ban")
@rate_limit("10/minute")
async def ban_user(
    request: Request,
    user_id: str,
    payload: AdminUserBanRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Ban or unban a user. Admin only (cannot ban self)."""
    try:
        user = await admin_service.ban_user(db, user_id, payload.is_banned, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return {
        "id": user.id,
        "is_banned": user.is_banned,
    }


@router.patch("/users/{user_id}/role")
@rate_limit("10/minute")
async def change_user_role(
    request: Request,
    user_id: str,
    payload: AdminUserRoleRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Change user role (admin/user). Admin only (cannot change own role)."""
    try:
        user = await admin_service.change_user_role(db, user_id, payload.role, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return {
        "id": user.id,
        "role": user.role.value,
    }


@router.patch("/users/{user_id}/plan")
@rate_limit("10/minute")
async def change_user_plan(
    request: Request,
    user_id: str,
    payload: AdminUserPlanRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Grant or revoke Pro membership. Admin only."""
    try:
        user = await admin_service.change_user_plan(db, user_id, payload.plan, payload.duration_days)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return {
        "id": user.id,
        "plan": user.plan.value,
        "plan_expires_at": user.plan_expires_at.isoformat() if user.plan_expires_at else None,
    }


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------


@router.get("/orders", response_model=PaginatedResponse)
@rate_limit("30/minute")
async def list_admin_orders(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all orders with user phone. Admin only."""
    return await admin_service.list_admin_orders(db, page=page, page_size=page_size)


# ---------------------------------------------------------------------------
# Redemption records (prototype 29 订单管理 — 非经营性平台，订单=兑换记录)
# ---------------------------------------------------------------------------


@router.get("/redemptions", response_model=PaginatedResponse)
@rate_limit("30/minute")
async def list_admin_redemptions(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None, description="Filter: redeemed / revoked / refunded"),
    keyword: str | None = Query(None, description="Search code or user phone"),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List redeem-code activation records with user phone. Admin only."""
    return await admin_service.list_redemptions(db, page=page, page_size=page_size, status=status, keyword=keyword)


@router.get("/redemptions/summary")
@rate_limit("30/minute")
async def redemption_summary(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Status counts for the redemption records stat strip. Admin only."""
    return await admin_service.redemption_summary(db)


# ---------------------------------------------------------------------------
# Platform settings (prototype 32 系统设置)
# ---------------------------------------------------------------------------


@router.get("/settings")
@rate_limit("30/minute")
async def get_settings(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the singleton admin settings row (defaults if absent)."""
    settings = await admin_service.get_admin_settings(db)
    return {
        "site_name": settings.site_name,
        "wechat_shop_url": settings.wechat_shop_url,
        "payments_enabled": settings.payments_enabled,
        "registration_enabled": settings.registration_enabled,
        "quality_block_enabled": settings.quality_block_enabled,
        "quality_block_threshold": float(settings.quality_block_threshold),
        "quality_warn_threshold": float(settings.quality_warn_threshold),
        "hallucination_detection_enabled": settings.hallucination_detection_enabled,
        "translate_timeout_sec": settings.translate_timeout_sec,
        "download_timeout_sec": settings.download_timeout_sec,
        "download_auto_retry_enabled": settings.download_auto_retry_enabled,
        "watchdog_enabled": settings.watchdog_enabled,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
    }


@router.put("/settings")
@rate_limit("10/minute")
async def update_settings(
    request: Request,
    payload: AdminSettingsUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Partially update the singleton admin settings row. Admin only."""
    try:
        settings = await admin_service.update_admin_settings(db, payload.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return {
        "site_name": settings.site_name,
        "wechat_shop_url": settings.wechat_shop_url,
        "payments_enabled": settings.payments_enabled,
        "registration_enabled": settings.registration_enabled,
        "quality_block_enabled": settings.quality_block_enabled,
        "quality_block_threshold": float(settings.quality_block_threshold),
        "quality_warn_threshold": float(settings.quality_warn_threshold),
        "hallucination_detection_enabled": settings.hallucination_detection_enabled,
        "translate_timeout_sec": settings.translate_timeout_sec,
        "download_timeout_sec": settings.download_timeout_sec,
        "download_auto_retry_enabled": settings.download_auto_retry_enabled,
        "watchdog_enabled": settings.watchdog_enabled,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
    }


@router.get("/admins")
@rate_limit("30/minute")
async def list_admin_accounts(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List accounts with admin role (settings page 管理员账户). Admin only."""
    return await admin_service.list_admin_accounts(db)

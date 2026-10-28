"""Admin API router — all admin-only endpoints under /api/v1/admin.

This router consolidates the admin management endpoints that don't belong
in existing domain routers (videos, orders, users). Those keep their admin
routes in-place; this file adds the missing ones:

  - Dashboard stats
  - User management (list, ban, role change, plan grant/revoke)
  - 金数据 payment records + revenue summary (read-only; the legacy ``orders``
    surface is gone — real revenue lives in ``jinshuju_payments``)
"""

from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.admin import (
    AdminAccountItem,
    AdminPaymentRow,
    AdminPaymentSummaryResponse,
    AdminPaymentSyncResponse,
    AdminSettingsResponse,
    AdminSettingsUpdate,
    AdminStatsResponse,
    AdminUserBanRequest,
    AdminUserBanResponse,
    AdminUserPlanRequest,
    AdminUserPlanResponse,
    AdminUserRoleRequest,
    AdminUserRoleResponse,
    AdminUserRow,
    WorkerStatusResponse,
)
from app.schemas.pagination import PaginatedResponse
from app.services import admin_service

router = APIRouter(prefix="/admin", tags=["admin"])

#: Admin user-list filters are validated by FastAPI (422 instead of silently
#: ignoring unknown values, ADM-11). ``expired`` is a synthetic plan bucket.
AdminRoleFilter = Literal["user", "admin"]
AdminPlanFilter = Literal["free", "pro", "expired"]
AdminPaymentStatusFilter = Literal["applied", "pending", "ignored", "refunded", "error"]


# ---------------------------------------------------------------------------
# GPU worker status
# ---------------------------------------------------------------------------


@router.get("/worker-status", response_model=WorkerStatusResponse)
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


@router.get("/stats", response_model=AdminStatsResponse)
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


@router.get("/users", response_model=PaginatedResponse[AdminUserRow])
@rate_limit("30/minute")
async def list_admin_users(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: AdminRoleFilter | None = Query(None, description="Filter by role: user / admin"),
    plan: AdminPlanFilter | None = Query(None, description="Filter by plan: free / pro / expired"),
    keyword: str | None = Query(None, max_length=100, description="Search name or phone"),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List users with aggregated stats. Admin only."""
    return await admin_service.list_admin_users(
        db, page=page, page_size=page_size, role=role, plan=plan, keyword=keyword
    )


@router.patch("/users/{user_id}/ban", response_model=AdminUserBanResponse)
@rate_limit("10/minute")
async def ban_user(
    request: Request,
    user_id: str,
    payload: AdminUserBanRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Ban or unban a user. Admin only (cannot ban self)."""
    user = await admin_service.ban_user(db, user_id, payload.is_banned, current_user.id)
    return {
        "id": user.id,
        "is_banned": user.is_banned,
    }


@router.patch("/users/{user_id}/role", response_model=AdminUserRoleResponse)
@rate_limit("10/minute")
async def change_user_role(
    request: Request,
    user_id: str,
    payload: AdminUserRoleRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Change user role (admin/user). Admin only (cannot change own role)."""
    user = await admin_service.change_user_role(db, user_id, payload.role, current_user.id)
    return {
        "id": user.id,
        "role": user.role.value,
    }


@router.patch("/users/{user_id}/plan", response_model=AdminUserPlanResponse)
@rate_limit("10/minute")
async def change_user_plan(
    request: Request,
    user_id: str,
    payload: AdminUserPlanRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Grant or revoke Pro membership. Admin only."""
    user = await admin_service.change_user_plan(db, user_id, payload.plan, payload.duration_days, current_user.id)
    return {
        "id": user.id,
        "plan": user.plan.value,
        "plan_expires_at": user.plan_expires_at.isoformat() if user.plan_expires_at else None,
        # ADM-17: additively expose the entitlement provenance so the panel can
        # tell an admin grant from a purchase/trial.
        "plan_source": user.plan_source,
    }


# ---------------------------------------------------------------------------
# 金数据 payment records / revenue (read-only; replaces the dead orders list)
# ---------------------------------------------------------------------------


@router.get("/payments", response_model=PaginatedResponse[AdminPaymentRow])
@rate_limit("30/minute")
async def list_admin_payments(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: AdminPaymentStatusFilter | None = Query(
        None, description="Filter by payment status: applied / pending / ignored / refunded / error"
    ),
    keyword: str | None = Query(None, max_length=100, description="Search phone / trade number / tier / serial"),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List 金数据 payment records (raw_json never exposed). Admin only."""
    return await admin_service.list_admin_payments(db, page=page, page_size=page_size, status=status, keyword=keyword)


@router.get("/payments/summary", response_model=AdminPaymentSummaryResponse)
@rate_limit("30/minute")
async def get_payment_summary(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Status counters + revenue sums for the payments page. Admin only."""
    return await admin_service.payment_summary(db)


@router.post("/payments/sync", response_model=AdminPaymentSyncResponse)
@rate_limit("5/minute")
async def sync_admin_payments(
    request: Request,
    current_user: User = Depends(get_admin_user),
):
    """Enqueue the Jinshuju sync Celery task (no inline external HTTP).

    Returns ``{"queued": false}`` when 金数据 integration is disabled or not
    configured — there is nothing to sync in that case.
    """
    return {"queued": admin_service.enqueue_payment_sync(current_user.id)}


# ---------------------------------------------------------------------------
# Platform settings (prototype 32 系统设置)
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=AdminSettingsResponse)
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


@router.put("/settings", response_model=AdminSettingsResponse)
@rate_limit("10/minute")
async def update_settings(
    request: Request,
    payload: AdminSettingsUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Partially update the singleton admin settings row. Admin only."""
    settings = await admin_service.update_admin_settings(db, payload.model_dump(exclude_unset=True))
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


@router.get("/admins", response_model=list[AdminAccountItem])
@rate_limit("30/minute")
async def list_admin_accounts(
    request: Request,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List accounts with admin role (settings page 管理员账户). Admin only."""
    return await admin_service.list_admin_accounts(db)

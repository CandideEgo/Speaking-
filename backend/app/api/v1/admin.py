"""Admin API router — all admin-only endpoints under /api/v1/admin.

This router consolidates the admin management endpoints that don't belong
in existing domain routers (videos, invite-codes, rubrics). Those keep
their admin routes in-place; this file adds the missing ones:

  - Dashboard stats
  - User management (list, ban, role change, plan grant/revoke)
  - Community moderation (reports, posts, comments)
  - Orders listing
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.user import User
from app.schemas.admin import (
    AdminReportResolveRequest,
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
    keyword: str | None = Query(None, description="Search name or email"),
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
# Community moderation — Reports
# ---------------------------------------------------------------------------


@router.get("/reports", response_model=PaginatedResponse)
@rate_limit("30/minute")
async def list_admin_reports(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    report_status: str | None = Query(None, alias="status", description="Filter: pending / reviewed / dismissed"),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List comment reports. Admin only."""
    return await admin_service.list_admin_reports(db, page=page, page_size=page_size, status=report_status)


@router.patch("/reports/{report_id}")
@rate_limit("10/minute")
async def resolve_report(
    request: Request,
    report_id: str,
    payload: AdminReportResolveRequest,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a report: 'remove' deletes the comment, 'dismiss' keeps it. Admin only."""
    try:
        report = await admin_service.resolve_report(db, report_id, payload.action)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return {
        "id": report.id,
        "status": report.status,
    }


# ---------------------------------------------------------------------------
# Community moderation — Posts
# ---------------------------------------------------------------------------


@router.get("/posts", response_model=PaginatedResponse)
@rate_limit("30/minute")
async def list_admin_posts(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str | None = Query(None, description="Search content or author"),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List posts for admin management. Admin only."""
    return await admin_service.list_admin_posts(db, page=page, page_size=page_size, keyword=keyword)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
@rate_limit("10/minute")
async def admin_delete_post(
    request: Request,
    post_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Force-delete a post (no ownership check). Admin only."""
    try:
        await admin_service.admin_delete_post(db, post_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return None


# ---------------------------------------------------------------------------
# Community moderation — Comments
# ---------------------------------------------------------------------------


@router.get("/posts/{post_id}/comments")
@rate_limit("30/minute")
async def list_admin_comments(
    request: Request,
    post_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all comments for a post. Admin only."""
    return await admin_service.list_admin_comments(db, post_id)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
@rate_limit("10/minute")
async def admin_delete_comment(
    request: Request,
    comment_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Force-delete a comment. Admin only."""
    try:
        await admin_service.admin_delete_comment(db, comment_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return None


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
    """List all orders with user email. Admin only."""
    return await admin_service.list_admin_orders(db, page=page, page_size=page_size)

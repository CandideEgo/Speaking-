"""Feedback endpoints - user submission + admin review/broadcast.

User side:
- POST /feedback            - submit feedback (auth required)
- GET  /feedback/mine       - list the user's own feedback (auth required)

Admin side:
- GET   /admin/feedback              - list all feedback (filterable by status)
- PATCH /admin/feedback/{id}         - update status / reply
- POST  /admin/announcements         - broadcast an announcement to all users
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_user, get_current_user
from app.core.database import get_db
from app.core.limiter import rate_limit
from app.models.feedback import Feedback
from app.models.user import User
from app.schemas.feedback import (
    AdminFeedbackResponse,
    AdminFeedbackUpdate,
    AnnouncementCreate,
    AnnouncementResponse,
    FeedbackCreate,
    FeedbackResponse,
)
from app.schemas.pagination import paginated
from app.services.notification_service import broadcast_announcement

router = APIRouter(prefix="/feedback", tags=["feedback"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])


# --- User side ---------------------------------------------------------------


@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("10/minute")
async def submit_feedback(
    request: Request,
    payload: FeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit feedback / a bug report / a suggestion. Rate-limited to deter spam."""
    fb = Feedback(
        user_id=current_user.id,
        category=payload.category,
        content=payload.content,
        contact=payload.contact,
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return FeedbackResponse.model_validate(fb)


@router.get("/mine", response_model=list[FeedbackResponse])
@rate_limit("30/minute")
async def list_my_feedback(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the current user's own feedback (newest first)."""
    result = await db.execute(
        select(Feedback).where(Feedback.user_id == current_user.id).order_by(Feedback.created_at.desc())
    )
    return [FeedbackResponse.model_validate(f) for f in result.scalars().all()]


# --- Admin side --------------------------------------------------------------


@admin_router.get("/feedback", response_model=dict)
@rate_limit("30/minute")
async def list_admin_feedback(
    request: Request,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """List all feedback, optionally filtered by status. Newest first."""
    stmt = select(Feedback)
    if status_filter:
        stmt = stmt.where(Feedback.status == status_filter)
    stmt = stmt.order_by(Feedback.created_at.desc())
    result = await db.execute(stmt.offset((page - 1) * page_size).limit(page_size + 1))
    rows = result.scalars().all()
    has_more = len(rows) > page_size
    items = rows[:page_size]

    # Resolve user names in one pass (phone redacted to last 4 for privacy).
    user_ids = {f.user_id for f in items}
    users: dict[str, User] = {}
    if user_ids:
        user_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in user_result.scalars().all():
            users[u.id] = u

    def serialize(f: Feedback) -> dict:
        u = users.get(f.user_id)
        name = u.name if u and u.name else None
        if not name and u and u.phone:
            name = f"用户 ***{u.phone[-4:]}"
        elif not name:
            name = "匿名用户"
        resp = AdminFeedbackResponse.model_validate({**f.__dict__, "user_name": name})
        return resp.model_dump(mode="json")

    return paginated(
        [serialize(f) for f in items],
        page=page,
        page_size=page_size,
        has_more=has_more,
    )


@admin_router.patch("/feedback/{feedback_id}", response_model=AdminFeedbackResponse)
@rate_limit("60/minute")
async def update_admin_feedback(
    request: Request,
    feedback_id: str,
    payload: AdminFeedbackUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a feedback's status and/or reply. Sets handled_by on first response."""
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if fb is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")

    if payload.status is not None:
        fb.status = payload.status
    if payload.admin_reply is not None:
        fb.admin_reply = payload.admin_reply
        if fb.handled_by is None:
            fb.handled_by = current_user.id

    await db.commit()
    await db.refresh(fb)

    u = (await db.execute(select(User).where(User.id == fb.user_id))).scalar_one_or_none()
    name = u.name if u and u.name else None
    if not name and u and u.phone:
        name = f"用户 ***{u.phone[-4:]}"
    elif not name:
        name = "匿名用户"
    return AdminFeedbackResponse.model_validate({**fb.__dict__, "user_name": name})


@admin_router.post("/announcements", response_model=AnnouncementResponse)
@rate_limit("10/minute")
async def broadcast_admin_announcement(
    request: Request,
    payload: AnnouncementCreate,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Broadcast an announcement notification to every user. Returns the count
    notified. Admin only."""
    count = await broadcast_announcement(
        db,
        title=payload.title,
        message=payload.message,
        related_url=payload.related_url,
    )
    return AnnouncementResponse(
        notified_count=count,
        title=payload.title,
        message=payload.message,
    )

"""Admin-specific Pydantic schemas for request/response validation.

These schemas are separate from the user-facing schemas because admin responses
include extra fields (aggregated counts, cross-entity joins, admin-only flags)
that don't belong in the public API contract.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class AdminUserBanRequest(BaseModel):
    is_banned: bool


class AdminUserRoleRequest(BaseModel):
    role: Literal["user", "admin"]


class AdminUserPlanRequest(BaseModel):
    plan: Literal["free", "pro"]
    duration_days: int = Field(default=30, ge=1, le=3650)


class AdminReportResolveRequest(BaseModel):
    action: Literal["remove", "dismiss"]


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


def _dt(v: object) -> str:
    """Serialize datetime to ISO string."""
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


class AdminStatsTrendResponse(BaseModel):
    dates: list[str]
    signups: list[int]
    vocabulary: list[int]
    active_users: list[int]


class AdminStatsResponse(BaseModel):
    total_users: int
    new_users_7d: int
    pro_users: int
    total_videos: int
    videos_ready: int
    total_vocabulary: int
    total_posts: int
    pending_reports: int
    active_users_today: int
    active_users_7d: int
    trend: AdminStatsTrendResponse
    videos_by_status: list[dict]
    users_by_plan: list[dict]
    recent_activity: list[dict]


class AdminUserResponse(BaseModel):
    id: str
    email: str | None = None
    phone: str | None = None
    name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    level: str | None = None
    plan: str
    plan_expires_at: str | None = None
    timezone: str | None = None
    role: str
    is_banned: bool
    created_at: str
    last_active_at: str | None = None
    # Aggregated counts (computed in service layer, not DB columns).
    # speaking_attempts intentionally omitted — AI speaking scoring removed
    # (ADR-0002/0003); the SpeakingAttempt table is frozen.
    videos_watched: int = 0
    posts_count: int = 0

    model_config = {"from_attributes": True}

    @classmethod
    def serialize_dt(cls, v: object) -> str:
        return _dt(v)

    # field_validators run before model_validation, so we use mode="before"
    # on datetime fields that come from SQLAlchemy model attributes.


class AdminPostResponse(BaseModel):
    id: str
    content: str
    post_type: str
    like_count: int = 0
    comment_count: int = 0
    user_name: str | None = None
    user_avatar_url: str | None = None
    user_level: str | None = None
    user_id: str
    author_email: str | None = None
    is_pinned: bool = False  # Not a DB field; always false for now
    is_liked: bool = False  # Not relevant for admin view
    report_count: int = 0
    created_at: str

    model_config = {"from_attributes": True}


class AdminCommentResponse(BaseModel):
    id: str
    post_id: str
    content: str
    user_id: str
    user_name: str | None = None
    user_avatar_url: str | None = None
    created_at: str
    is_deleted: bool = False  # Not a DB column; always false (comments are hard-deleted)

    model_config = {"from_attributes": True}


class AdminReportResponse(BaseModel):
    id: str
    comment_id: str
    comment_content: str
    comment_author_name: str | None = None
    reporter_id: str
    reporter_name: str | None = None
    reason: str
    status: str
    created_at: str
    # Denormalized parent post info for context
    post_id: str | None = None
    post_snippet: str | None = None

    model_config = {"from_attributes": True}


class AdminOrderResponse(BaseModel):
    id: str
    order_number: str
    user_id: str
    user_email: str | None = None
    plan: str
    amount: int
    status: str
    paid_at: str | None = None
    created_at: str

    model_config = {"from_attributes": True}

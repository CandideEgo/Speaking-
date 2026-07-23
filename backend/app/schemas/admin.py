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
    active_users_today: int
    active_users_7d: int
    # Real-time / today KPIs (DEV-FLOW 2026-07 Phase B2)
    online_now: int = 0
    gpu_queue_depth: int = 0
    videos_error_count: int = 0
    signups_today: int = 0
    redeems_today: int = 0
    trend: AdminStatsTrendResponse
    videos_by_status: list[dict]
    users_by_plan: list[dict]
    recent_activity: list[dict]


class AdminUserResponse(BaseModel):
    id: str
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

    model_config = {"from_attributes": True}

    @classmethod
    def serialize_dt(cls, v: object) -> str:
        return _dt(v)

    # field_validators run before model_validation, so we use mode="before"
    # on datetime fields that come from SQLAlchemy model attributes.


class AdminOrderResponse(BaseModel):
    id: str
    order_number: str
    user_id: str
    user_phone: str | None = None
    plan: str
    amount: int
    status: str
    paid_at: str | None = None
    created_at: str

    model_config = {"from_attributes": True}

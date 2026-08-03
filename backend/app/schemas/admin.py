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


class AdminSettingsUpdate(BaseModel):
    """Partial update of the singleton admin settings row (prototype 32)."""

    # 通用配置
    site_name: str | None = Field(default=None, max_length=100)
    wechat_shop_url: str | None = Field(default=None, max_length=500)
    payments_enabled: bool | None = None
    registration_enabled: bool | None = None
    # 质量门禁
    quality_block_enabled: bool | None = None
    quality_block_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    quality_warn_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    hallucination_detection_enabled: bool | None = None
    # 视频管线
    translate_timeout_sec: int | None = Field(default=None, ge=60, le=86400)
    download_timeout_sec: int | None = Field(default=None, ge=60, le=86400)
    download_auto_retry_enabled: bool | None = None
    watchdog_enabled: bool | None = None


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
    # Prototype 31 extensions: Pro conversion funnel + topic distribution
    pro_expired_count: int = 0
    funnel: dict = {}
    videos_by_topic: list[dict] = []


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
    learned_words: int = 0

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


class AdminSettingsResponse(BaseModel):
    """Singleton admin settings (prototype 32 系统设置)."""

    site_name: str
    wechat_shop_url: str | None = None
    payments_enabled: bool
    registration_enabled: bool
    quality_block_enabled: bool
    quality_block_threshold: float
    quality_warn_threshold: float
    hallucination_detection_enabled: bool
    translate_timeout_sec: int
    download_timeout_sec: int
    download_auto_retry_enabled: bool
    watchdog_enabled: bool
    updated_at: str | None = None

    model_config = {"from_attributes": True}


class AdminAccountResponse(BaseModel):
    """One admin account row for the settings page admin list."""

    id: str
    name: str | None = None
    phone: str | None = None
    last_active_at: str | None = None


class RedemptionRecordResponse(BaseModel):
    """Redeem-code activation record — powers the 订单管理 page (prototype 29).

    The platform is non-commercial (no in-app payments), so "orders" are
    redeem-code activations; refund == clawback of the granted Pro time.
    """

    id: str
    code: str
    user_id: str | None = None
    user_phone: str | None = None
    plan: str
    duration_days: int
    status: str
    revoked_reason: str | None = None
    used_at: str | None = None
    created_at: str

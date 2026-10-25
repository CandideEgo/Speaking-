"""Admin-specific Pydantic schemas for request/response validation.

These schemas are separate from the user-facing schemas because admin responses
include extra fields (aggregated counts, cross-entity joins, admin-only flags)
that don't belong in the public API contract.
"""

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
# Response schemas (BE-07: admin lists must not degrade to untyped items)
# ---------------------------------------------------------------------------


class AdminUserRow(BaseModel):
    id: str
    phone: str | None = None
    name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    gender: str | None = None
    level: str | None = None
    plan: str
    plan_expires_at: str | None = None
    timezone: str | None = None
    role: str
    is_banned: bool = False
    created_at: str | None = None
    last_active_at: str | None = None
    videos_watched: int = 0
    learned_words: int = 0


class AdminOrderRow(BaseModel):
    id: str
    order_number: str
    user_id: str | None = None
    user_phone: str | None = None
    plan: str | None = None
    amount: int | None = None
    status: str
    paid_at: str | None = None
    created_at: str | None = None


class AdminRedemptionRow(BaseModel):
    id: str
    code: str
    user_id: str | None = None
    user_phone: str | None = None
    plan: str
    duration_days: int | None = None
    status: str
    revoked_reason: str | None = None
    used_at: str | None = None
    created_at: str | None = None


class AdminSettingsResponse(BaseModel):
    site_name: str | None = None
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


class WorkerStatusResponse(BaseModel):
    worker_online: bool


class RedemptionSummaryResponse(BaseModel):
    redeemed: int
    revoked: int
    refunded: int


class AdminStatsTrend(BaseModel):
    dates: list[str]
    signups: list[int]
    vocabulary: list[int]
    active_users: list[int]


class AdminStatsCount(BaseModel):
    count: int


class AdminStatsVideoStatus(AdminStatsCount):
    status: str


class AdminStatsUserPlan(AdminStatsCount):
    plan: str


class AdminStatsVideoTopic(AdminStatsCount):
    topic: str


class AdminStatsRecentActivity(BaseModel):
    id: str
    type: str
    summary: str
    created_at: str | None = None


class AdminStatsFunnel(BaseModel):
    registered: int
    watched: int
    vocab_saved: int
    pro: int


class AdminStatsResponse(BaseModel):
    total_users: int
    new_users_7d: int
    pro_users: int
    total_videos: int
    videos_ready: int
    total_vocabulary: int
    active_users_today: int
    active_users_7d: int
    online_now: int
    gpu_queue_depth: int
    videos_error_count: int
    signups_today: int
    redeems_today: int
    trend: AdminStatsTrend
    videos_by_status: list[AdminStatsVideoStatus]
    users_by_plan: list[AdminStatsUserPlan]
    recent_activity: list[AdminStatsRecentActivity]
    pro_expired_count: int
    funnel: AdminStatsFunnel
    videos_by_topic: list[AdminStatsVideoTopic]


class AdminAccountItem(BaseModel):
    id: str
    name: str | None = None
    phone: str | None = None
    last_active_at: str | None = None


class AdminUserBanResponse(BaseModel):
    id: str
    is_banned: bool


class AdminUserRoleResponse(BaseModel):
    id: str
    role: str


class AdminUserPlanResponse(BaseModel):
    id: str
    plan: str
    plan_expires_at: str | None = None

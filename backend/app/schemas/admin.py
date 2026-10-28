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
    # ``0`` is valid on purpose: revoking Pro has no duration, and the admin
    # users page already sends ``duration_days: 0`` when revoking. The old
    # ``ge=1`` made every revoke fail with 422 (found while testing ADM-17).
    duration_days: int = Field(default=30, ge=0, le=3650)


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


class AdminPaymentRow(BaseModel):
    """One 金数据 (Jinshuju) payment record row.

    ``raw_json`` is deliberately **not** exposed: it contains the full external
    form payload (buyer phone, WeChat identifiers, ...) and is only needed for
    server-side debugging. ``phone`` is the display phone (linked account phone
    when the record was matched to a user, otherwise the phone the buyer typed
    on the Jinshuju form); ``user_phone``/``user_name`` are the linked account's
    own fields and stay null for records not yet matched.
    """

    id: str
    entry_token: str | None = None
    serial_number: int
    phone: str | None = None
    user_id: str | None = None
    user_phone: str | None = None
    user_name: str | None = None
    tier_name: str | None = None
    amount_fen: int | None = None
    duration_days: int | None = None
    trade_status: str | None = None
    trade_no: str | None = None
    payment_method: str | None = None
    status: str
    error_message: str | None = None
    entry_created_at: str | None = None
    created_at: str | None = None
    applied_at: str | None = None


class AdminPaymentSummaryResponse(BaseModel):
    """Revenue / payment status counters for the admin payments page.

    All money fields are in fen (分). ``paid_*`` sums only count ``applied``
    records (money received **and** membership granted); refunded orders are
    excluded from revenue on purpose. "Today"/"last 30 days" are measured on
    the payment time (``entry_created_at``, falling back to the local ingest
    time ``created_at``) and use a **UTC day boundary**, matching the rest of
    the admin KPIs (timezone note in ``backend/docs``).
    """

    applied: int = 0
    pending: int = 0
    ignored: int = 0
    refunded: int = 0
    error: int = 0
    paid_total_fen: int = 0
    paid_30d_fen: int = 0
    paid_today_fen: int = 0
    applied_today: int = 0


class AdminPaymentSyncResponse(BaseModel):
    """Result of POST /admin/payments/sync — enqueue only, never inline HTTP."""

    queued: bool


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
    """Result of an admin plan grant/revoke.

    ``plan_source`` is additive (ADM-17): admin grants write ``"admin"`` and
    revokes clear it, so the panel can tell a manual grant from a purchase /
    trial entitlement.
    """

    id: str
    plan: str
    plan_expires_at: str | None = None
    plan_source: str | None = None

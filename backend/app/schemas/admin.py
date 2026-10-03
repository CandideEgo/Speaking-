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

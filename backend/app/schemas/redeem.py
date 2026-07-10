from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.redeem import RedeemStatus, RevokedReason


class RedeemCodeGenerate(BaseModel):
    count: int = Field(default=10, ge=1, le=100)
    plan: str = "pro"
    duration_days: int = Field(default=30, ge=1, le=365)
    batch_label: str | None = Field(default=None, max_length=100)


class RedeemCodeResponse(BaseModel):
    id: str
    code: str
    plan: str
    duration_days: int
    batch_label: str | None
    status: RedeemStatus
    revoked_reason: RevokedReason | None
    expires_at: datetime | None
    used_by: str | None
    used_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RedeemCodeRedeem(BaseModel):
    code: str


class RedeemResponse(BaseModel):
    success: bool
    message: str
    plan: str | None = None
    # New expiry after redeem, so the /redeem page can show it (ADR-0007 UX).
    plan_expires_at: datetime | None = None


class RedeemRevokeRequest(BaseModel):
    # Admin voids an *unused* code. "refund" is reserved for the refund
    # endpoint (claws back time on a redeemed code), so it is not selectable
    # here.
    reason: Literal["leak", "error"] = "error"


class RedeemRevokeResponse(BaseModel):
    success: bool
    message: str
    code_id: str
    status: RedeemStatus


class RedeemRefundResponse(BaseModel):
    """Result of a refund clawback on an already-redeemed code (ADR-0007)."""

    success: bool
    message: str
    code_id: str
    user_id: str
    plan: str
    plan_expires_at: datetime | None

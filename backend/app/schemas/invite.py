from pydantic import BaseModel, Field
from datetime import datetime


class InviteCodeGenerate(BaseModel):
    count: int = Field(default=10, ge=1, le=100)
    plan: str = "pro"
    duration_days: int = Field(default=30, ge=1, le=365)
    batch_label: str | None = Field(default=None, max_length=100)


class InviteCodeResponse(BaseModel):
    id: str
    code: str
    plan: str
    duration_days: int
    batch_label: str | None
    is_used: bool
    used_by: str | None
    used_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class InviteCodeRedeem(BaseModel):
    code: str


class RedeemResponse(BaseModel):
    success: bool
    message: str
    plan: str | None = None

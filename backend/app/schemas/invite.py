from pydantic import BaseModel
from datetime import datetime


class InviteCodeGenerate(BaseModel):
    count: int = 10
    plan: str = "pro"
    duration_days: int = 30
    batch_label: str | None = None


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

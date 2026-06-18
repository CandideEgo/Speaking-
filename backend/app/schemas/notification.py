from datetime import datetime
from pydantic import BaseModel, field_validator


class NotificationResponse(BaseModel):
    id: str
    type: str
    title: str
    message: str
    is_read: bool
    related_url: str | None
    created_at: str

    model_config = {"from_attributes": True}

    @field_validator('created_at', mode='before')
    @classmethod
    def serialize_created_at(cls, v: object) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


class UnreadCountResponse(BaseModel):
    count: int

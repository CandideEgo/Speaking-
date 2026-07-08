from datetime import datetime

from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: str
    title: str
    message: str | None = None
    is_read: bool = False
    related_url: str | None = None
    data: str | None = None
    read_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UnreadCountResponse(BaseModel):
    count: int


class NotificationPreferencesResponse(BaseModel):
    push_notifications: bool = True
    streak_reminder: bool = True
    weekly_report: bool = True
    community_updates: bool = True
    new_follower: bool = True
    comment_reply: bool = True

    model_config = {"from_attributes": True}


class NotificationPreferencesUpdate(BaseModel):
    push_notifications: bool | None = None
    streak_reminder: bool | None = None
    weekly_report: bool | None = None
    community_updates: bool | None = None
    new_follower: bool | None = None
    comment_reply: bool | None = None

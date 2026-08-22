from datetime import datetime

from pydantic import BaseModel, Field

# Single source of truth for default notification preferences, shared by the
# REST layer (backend/app/api/v1/notifications.py) and the response schema so
# the two cannot drift. Community-typed prefs (community_updates/new_follower/
# comment_reply) are dormant since ADR-0012 cut the community — kept for
# schema compat, OFF by default.
DEFAULT_NOTIFICATION_PREFS: dict[str, bool] = {
    "push_notifications": True,
    "streak_reminder": True,
    "weekly_report": True,
    "community_updates": False,
    "new_follower": False,
    "comment_reply": False,
}


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
    push_notifications: bool = DEFAULT_NOTIFICATION_PREFS["push_notifications"]
    streak_reminder: bool = DEFAULT_NOTIFICATION_PREFS["streak_reminder"]
    weekly_report: bool = DEFAULT_NOTIFICATION_PREFS["weekly_report"]
    # Community-typed prefs are dormant (ADR-0012) — OFF by default.
    community_updates: bool = DEFAULT_NOTIFICATION_PREFS["community_updates"]
    new_follower: bool = DEFAULT_NOTIFICATION_PREFS["new_follower"]
    comment_reply: bool = DEFAULT_NOTIFICATION_PREFS["comment_reply"]

    model_config = {"from_attributes": True}


class NotificationPreferencesUpdate(BaseModel):
    push_notifications: bool | None = None
    streak_reminder: bool | None = None
    weekly_report: bool | None = None
    community_updates: bool | None = None
    new_follower: bool | None = None
    comment_reply: bool | None = None

"""Shared, domain-agnostic brief schemas used across non-community features.

`UserProfileBrief` and `VideoBrief` lived in `schemas/community.py` but are
consumed by the learning module and video service (not just community). They
move here so the community schemas can be deleted (ADR-0012) without breaking
learning/video responses.
"""

from datetime import datetime

from pydantic import BaseModel


class OkResponse(BaseModel):
    """Generic acknowledgement for lightweight POST endpoints."""

    ok: bool


class AcknowledgedResponse(BaseModel):
    """GPU-worker callback acknowledgement (optional quality_check marker)."""

    acknowledged: bool
    quality_check: str | None = None


class UserProfileBrief(BaseModel):
    """Minimal user info shown in community responses."""

    id: str
    name: str | None
    avatar_url: str | None = None
    level: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, user) -> dict:
        """Build a UserProfileBrief dict from a User model instance."""
        return cls.model_validate(user).model_dump()


class VideoBrief(BaseModel):
    """Minimal video info attached to a video_share post / community feed."""

    id: str
    title: str
    title_zh: str | None = None
    thumbnail_url: str | None = None
    duration: float | None = None
    difficulty_level: str | None = None
    video_url_720p: str | None = None
    # BUG-20：Video.channel_name 是实际列，from_attributes 自动带出；
    # 首页「继续观看」条需要频道名，此前 schema 未下发。
    channel_name: str | None = None
    view_count: int = 0
    favorite_count: int = 0
    upload_date: datetime | None = None
    published_at: datetime | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, video) -> dict | None:
        """Build a VideoBrief dict from a Video model, or None."""
        if video is None:
            return None
        return cls.model_validate(video).model_dump()

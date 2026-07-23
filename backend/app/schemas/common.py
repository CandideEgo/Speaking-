"""Shared, domain-agnostic brief schemas used across non-community features.

`UserProfileBrief` and `VideoBrief` lived in `schemas/community.py` but are
consumed by the learning module and video service (not just community). They
move here so the community schemas can be deleted (ADR-0012) without breaking
learning/video responses.
"""

from pydantic import BaseModel


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
    thumbnail_url: str | None = None
    duration: float | None = None
    difficulty_level: str | None = None
    video_url_720p: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, video) -> dict | None:
        """Build a VideoBrief dict from a Video model, or None."""
        if video is None:
            return None
        return cls.model_validate(video).model_dump()

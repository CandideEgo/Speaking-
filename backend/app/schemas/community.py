from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_serializer

from app.schemas.common import UserProfileBrief, VideoBrief


class PostCreate(BaseModel):
    post_type: Literal["text", "progress_share", "vocabulary_share", "speaking_share", "video_share"]
    content: str = Field(..., max_length=2000)
    media_url: str | None = None
    video_id: str | None = None
    speaking_attempt_id: str | None = None
    vocabulary_id: str | None = None


class PostResponse(BaseModel):
    id: str
    user: UserProfileBrief
    post_type: str
    content: str
    media_url: str | None = None
    like_count: int
    comment_count: int
    is_liked: bool
    created_at: datetime
    # Populated for video_share posts so the feed can render a video preview.
    video: VideoBrief | None = None

    @field_serializer("created_at")
    def serialize_created_at(self, v: datetime) -> str:
        return v.isoformat()

    model_config = {"from_attributes": True}


class CommentCreate(BaseModel):
    content: str = Field(..., max_length=500)
    parent_id: str | None = None


class CommentResponse(BaseModel):
    id: str
    user: UserProfileBrief
    content: str
    parent_id: str | None = None
    like_count: int
    is_liked: bool
    replies: list["CommentResponse"] = []
    created_at: datetime

    @field_serializer("created_at")
    def serialize_created_at(self, v: datetime) -> str:
        return v.isoformat()

    model_config = {"from_attributes": True}


class FollowResponse(BaseModel):
    id: str
    user: UserProfileBrief
    created_at: datetime

    @field_serializer("created_at")
    def serialize_created_at(self, v: datetime) -> str:
        return v.isoformat()

    model_config = {"from_attributes": True}


class ReportCreate(BaseModel):
    reason: str = Field(..., max_length=500)

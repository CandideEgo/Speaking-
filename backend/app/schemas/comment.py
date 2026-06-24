from datetime import datetime

from pydantic import BaseModel, field_validator


class CommentCreate(BaseModel):
    """Schema for creating a new comment."""

    video_id: str
    text: str
    author_name: str | None = None


class CommentUpdate(BaseModel):
    """Schema for updating an existing comment."""

    text: str | None = None
    author_name: str | None = None


class CommentResponse(BaseModel):
    """Schema for serializing a VideoComment in API responses."""

    id: str
    video_id: str
    external_id: str
    author_name: str | None
    text: str
    like_count: int
    reply_count: int
    published_at: str | None

    model_config = {"from_attributes": True}

    @field_validator("published_at", mode="before")
    @classmethod
    def serialize_published_at(cls, v: object) -> str | None:
        if isinstance(v, datetime):
            return v.isoformat()
        if v is None:
            return None
        return str(v)


class CommentStatsResponse(BaseModel):
    """Schema for serializing VideoCommentStats in API responses."""

    video_id: str
    total_comments: int
    total_likes: int
    avg_comment_length: float
    learning_relevance_score: int
    depth_score: int
    engagement_score: int
    overall_quality_score: int
    keyword_stats: dict | None
    analyzed_at: str | None

    model_config = {"from_attributes": True}

    @field_validator("analyzed_at", mode="before")
    @classmethod
    def serialize_analyzed_at(cls, v: object) -> str | None:
        if isinstance(v, datetime):
            return v.isoformat()
        if v is None:
            return None
        return str(v)


class VideoWithCommentScoreResponse(BaseModel):
    """Schema for videos listed by comment quality score."""

    id: str
    title: str
    thumbnail_url: str | None
    duration: float | None
    difficulty_level: str | None
    topic_tags: str | None
    comment_quality_score: float | None
    comment_count: int | None

    model_config = {"from_attributes": True}

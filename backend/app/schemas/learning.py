from datetime import datetime

from pydantic import BaseModel, field_serializer

from app.schemas.community import VideoBrief


class LearningRecordResponse(BaseModel):
    id: str
    video_id: str
    words_learned: int = 0
    speaking_attempts: int = 0
    quiz_score: float | None = None
    completed: bool = False
    time_spent_seconds: int = 0
    last_accessed_at: datetime | None = None
    progress_percentage: float = 0.0
    position_seconds: float | None = None
    created_at: datetime
    video: VideoBrief | None = None

    @field_serializer("last_accessed_at", "created_at")
    def serialize_datetime(self, v: datetime | None) -> str | None:
        return v.isoformat() if v is not None else None

    model_config = {"from_attributes": True}


class LearningRecordListResponse(BaseModel):
    records: list[LearningRecordResponse]
    total: int
    page: int
    page_size: int


class SaveProgressRequest(BaseModel):
    """Request body for saving video watch progress."""

    position_seconds: float
    video_id: str


class SaveProgressResponse(BaseModel):
    """Response after saving watch progress."""

    position_seconds: float
    progress_percentage: float

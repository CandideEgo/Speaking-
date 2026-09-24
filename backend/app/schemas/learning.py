from datetime import datetime

from pydantic import BaseModel, Field, field_serializer

from app.schemas.common import VideoBrief


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


class SaveProgressRequest(BaseModel):
    """Request body for saving video watch progress.

    ``position_seconds`` is not merely echoed back: it is stored, and it is
    divided by the video duration to derive ``progress_percentage``, which the
    retention scoring reads. A negative or non-finite value therefore does not
    just look wrong in the record — it propagates into a derived number.
    """

    position_seconds: float = Field(ge=0, allow_inf_nan=False)
    video_id: str


class SaveProgressResponse(BaseModel):
    """Response after saving watch progress."""

    position_seconds: float
    progress_percentage: float

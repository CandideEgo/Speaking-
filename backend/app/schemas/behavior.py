"""Behavior event request/response schemas (P0 behavior collection)."""

from pydantic import BaseModel, Field


class BehaviorEventRequest(BaseModel):
    """A single client-side behavior event. video_id/user_id filled by server."""

    video_id: str | None = None
    event_type: str = Field(..., max_length=32)
    event_payload: dict | None = None
    session_id: str | None = None
    client_ts: int | None = None


class BehaviorBatchRequest(BaseModel):
    """A flush of multiple events from the frontend analytics queue."""

    events: list[BehaviorEventRequest]


class BehaviorIngestResponse(BaseModel):
    ingested: int

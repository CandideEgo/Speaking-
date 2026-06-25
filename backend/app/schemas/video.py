from datetime import datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, field_validator


class VideoCreate(BaseModel):
    source_url: str

    @field_validator("source_url")
    @classmethod
    def validate_source_url(cls, v: str) -> str:
        if len(v) > 500:
            raise ValueError("URL too long (max 500 characters)")
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("Only HTTP/HTTPS URLs are allowed")
        return v


class VideoResponse(BaseModel):
    id: str
    title: str
    source_url: str
    video_source: str
    thumbnail_url: str | None
    duration: float | None
    difficulty_level: str | None
    status: str
    topic_tags: str | None
    is_official: bool
    video_url_480p: str | None = None
    video_url_720p: str | None = None
    video_url_1080p: str | None = None
    processing_mode: str | None = None
    processing_step: str | None = None
    created_at: str

    model_config = {"from_attributes": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def serialize_created_at(cls, v: object) -> str:
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


class SubtitleResponse(BaseModel):
    id: str
    start_time: float
    end_time: float
    text_en: str
    text_zh: str | None
    sentence_index: int
    grammar_note: str | None
    speaker: str | None

    model_config = {"from_attributes": True}


class VideoDetailResponse(VideoResponse):
    subtitles: list[SubtitleResponse]


class VideoAdminResponse(VideoResponse):
    """Admin-facing video view: exposes featured/notes/error/progress fields
    that the public ``VideoResponse`` intentionally hides."""

    is_featured: bool
    admin_notes: str | None = None
    error_message: str | None = None
    processing_progress: int = 0


class VideoAdminUpdate(BaseModel):
    """Partial update payload for the admin video management panel.

    All fields optional — only supplied fields are written. ``difficulty_level``
    is validated against the CEFR scale used elsewhere in the app.
    """

    title: str | None = None
    difficulty_level: str | None = None
    topic_tags: str | None = None
    is_official: bool | None = None
    is_featured: bool | None = None
    admin_notes: str | None = None

    @field_validator("difficulty_level")
    @classmethod
    def validate_difficulty(cls, v: str | None) -> str | None:
        if v is None:
            return v
        allowed = {"A1", "A2", "B1", "B2", "C1", "C2"}
        if v.upper() not in allowed:
            raise ValueError("difficulty_level must be one of A1, A2, B1, B2, C1, C2")
        return v.upper()


class VideoStatusResponse(BaseModel):
    status: str
    video_url_720p: str | None = None
    processing_step: str | None = None
    processing_progress: int | None = None


class TranscriptionSegment(BaseModel):
    """A single subtitle segment returned by the remote GPU transcription worker."""

    start: float
    end: float
    text: str


class TranscriptionCallbackRequest(BaseModel):
    """Inbound callback from the GPU worker delivering transcription results.

    The worker POSTs this to ``/api/v1/internal/transcription/callback``. On
    ``status == "ok"`` the cloud writes the segments as subtitle rows and
    enqueues the tail pipeline; on ``status == "error"`` it marks the video
    failed. Authenticated by a shared ``X-Callback-Secret`` header.
    """

    video_id: str
    status: Literal["ok", "error"]
    segments: list[TranscriptionSegment] | None = None
    error: str | None = None


class SubtitleSnippet(BaseModel):
    """A matching subtitle snippet returned by subtitle search."""

    id: str
    text_en: str
    start_time: float
    end_time: float


class SubtitleSearchResult(BaseModel):
    """A video with matching subtitle snippets from subtitle search."""

    video: VideoResponse
    matching_subtitles: list[SubtitleSnippet]

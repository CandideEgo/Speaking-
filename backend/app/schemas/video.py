from datetime import datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, field_validator, model_validator


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
    is_published: bool = False
    # UGC review lifecycle (draft/pending_review/published/rejected). Exposed so
    # the owner's "my videos" list and the admin queue can badge status.
    review_status: str = "draft"
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
    # Exam-level word annotations: {surface_token: [level keys]} or null.
    word_levels: dict | None = None

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
    # UGC review audit fields — admin sees why/when a video was rejected.
    rejection_reason: str | None = None
    submitted_at: str | None = None
    reviewed_at: str | None = None

    @field_validator("submitted_at", "reviewed_at", mode="before")
    @classmethod
    def _serialize_dt(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, datetime):
            return v.isoformat()
        return str(v)


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
    is_published: bool | None = None
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


class SubtitleUpdate(BaseModel):
    """Partial update payload for a single subtitle (admin review/edit).

    All fields optional — only supplied fields are written. Editing ``text_en``
    resets ``word_levels`` to the ECDICT baseline (the inflection index is
    derived from the English text), so manual word-level overrides on that line
    must be redone after an English edit — unless ``preserve_word_levels`` is
    set, in which case existing overrides are kept as-is.
    """

    text_en: str | None = None
    text_zh: str | None = None
    start_time: float | None = None
    end_time: float | None = None
    grammar_note: str | None = None
    speaker: str | None = None
    # When True, editing text_en does NOT reset word_levels to the ECDICT
    # baseline — existing manual overrides are preserved. Default False keeps
    # the original ingest-pipeline behaviour.
    preserve_word_levels: bool = False

    @field_validator("text_en", "text_zh", "grammar_note", "speaker")
    @classmethod
    def strip_and_require_nonempty(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("must not be empty/whitespace")
        return v

    @model_validator(mode="after")
    def validate_timing(self) -> "SubtitleUpdate":
        if self.start_time is not None and self.end_time is not None and self.start_time >= self.end_time:
            raise ValueError("start_time must be less than end_time")
        return self


class SubtitleBatchItem(SubtitleUpdate):
    """One subtitle update within a batch — carries the target subtitle id."""

    id: str


class SubtitleBatchUpdate(BaseModel):
    """Batch subtitle update payload — applies many edits in one transaction."""

    updates: list[SubtitleBatchItem]


class WordLevelsUpdate(BaseModel):
    """Manual override of one subtitle's word-level annotations.

    ``word_levels`` maps a lowercase surface token to a list of canonical exam
    level keys (mirrors app.core.exam_levels.EXAM_LEVEL_KEYS). Pass null to
    clear all annotations for the line.
    """

    word_levels: dict[str, list[str]] | None = None

    @field_validator("word_levels")
    @classmethod
    def validate_level_keys(cls, v: dict[str, list[str]] | None) -> dict[str, list[str]] | None:
        if v is None:
            return v
        from app.core.exam_levels import EXAM_LEVEL_KEYS

        allowed = set(EXAM_LEVEL_KEYS)
        for token, levels in v.items():
            if not isinstance(levels, list):
                raise ValueError(f"levels for {token!r} must be a list")
            for lvl in levels:
                if lvl not in allowed:
                    raise ValueError(f"unknown exam level {lvl!r} (allowed: {sorted(allowed)})")
        return v


class RecomputeWordLevelsRequest(BaseModel):
    """Recompute word_levels from ECDICT for selected subtitles (or all)."""

    subtitle_ids: list[str] | None = None  # None = whole video


class ReviewRejectRequest(BaseModel):
    """Admin rejection payload for a UGC video under review."""

    reason: str

    @field_validator("reason")
    @classmethod
    def require_nonempty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("reason must not be empty")
        return v


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

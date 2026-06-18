from datetime import datetime
from pydantic import BaseModel, field_validator
from urllib.parse import urlparse


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
        allowed_domains = (
            "youtube.com", "youtu.be",
            "bilibili.com", "b23.tv",
            "douyin.com", "v.douyin.com",
            "tiktok.com",
            "twitter.com", "x.com",
            "instagram.com",
        )
        hostname = (parsed.hostname or "").lower()
        if not any(d in hostname for d in allowed_domains):
            raise ValueError("Unsupported platform URL")
        return v


class VideoResponse(BaseModel):
    id: str
    title: str
    source_url: str
    platform: str
    thumbnail_url: str | None
    duration: float | None
    difficulty_level: str | None
    status: str
    topic_tags: str | None
    is_official: bool
    video_url_480p: str | None = None
    video_url_720p: str | None = None
    video_url_1080p: str | None = None
    youtube_video_id: str | None = None
    processing_mode: str | None = None
    processing_step: str | None = None
    created_at: str

    model_config = {"from_attributes": True}

    @field_validator('created_at', mode='before')
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


class VideoStatusResponse(BaseModel):
    status: str
    video_url_720p: str | None = None
    processing_step: str | None = None

from pydantic import BaseModel


class VideoCreate(BaseModel):
    source_url: str


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
    created_at: str

    model_config = {"from_attributes": True}


class SubtitleResponse(BaseModel):
    id: str
    start_time: float
    end_time: float
    text_en: str
    text_zh: str | None
    sentence_index: int
    grammar_note: str | None

    model_config = {"from_attributes": True}


class VideoDetailResponse(VideoResponse):
    subtitles: list[SubtitleResponse]

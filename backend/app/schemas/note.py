"""Notes response schema (BE-07)."""

from datetime import datetime

from pydantic import BaseModel


class NoteItem(BaseModel):
    id: str
    video_id: str
    title: str
    title_zh: str | None = None
    thumbnail_url: str | None = None
    channel_name: str | None = None
    channel_slug: str | None = None
    content: str
    created_at: datetime
    updated_at: datetime
    available: bool

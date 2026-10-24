"""Discovery response schemas (BE-07 first slice: subscriptions + favorites).

The broader search/dictionary/sets payloads are still untyped and tracked in
``docs/audit-2026-10-24/no-response-model-endpoints.md``.
"""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.channel import LatestVideo


class ContinueVideo(LatestVideo):
    progress_percentage: float
    position_seconds: float | None = None


class ChannelSubscriptionCard(BaseModel):
    id: str
    slug: str
    name: str
    description: str | None = None
    cover_url: str | None = None
    video_count: int
    latest_video: LatestVideo | None = None
    continue_video: ContinueVideo | None = None
    unlearned_count: int


class SubscriptionState(BaseModel):
    subscribed: bool


class SentenceFavoriteItem(BaseModel):
    id: str
    subtitle_id: str
    video_id: str
    title: str
    text_en: str
    text_zh: str | None = None
    start_time: float | None = None
    available: bool
    created_at: datetime


class SentenceFavoriteStatus(BaseModel):
    saved: bool

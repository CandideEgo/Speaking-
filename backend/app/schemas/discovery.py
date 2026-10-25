"""Discovery response schemas (BE-07 first slice: subscriptions + favorites).

The broader search/dictionary/sets payloads are still untyped and tracked in
``docs/audit-2026-10-24/no-response-model-endpoints.md``.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.channel import LatestVideo
from app.schemas.pagination import PaginatedResponse


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


class DictionaryWord(BaseModel):
    """One ECDICT row. Extra keys (frequency rank etc.) are preserved."""

    model_config = ConfigDict(extra="allow")

    lemma: str
    phonetic: str | None = None
    translation: str | None = None
    pos: str | None = None
    levels: list[str] = []
    bnc: int = 0


class DictionaryResponse(PaginatedResponse[DictionaryWord]):
    pass


class MetadataSampleWord(BaseModel):
    word: str
    phonetic: str | None = None
    translation: str | None = None
    levels: list[str]


class WordTimestamp(BaseModel):
    model_config = ConfigDict(extra="allow")

    word: str | None = None
    start: float | None = None
    end: float | None = None


class LearningMetadataItem(BaseModel):
    subtitle_count: int
    exam_word_count: int
    sample_text_en: str | None = None
    sample_text_zh: str | None = None
    sample_words: list[MetadataSampleWord]
    sample_subtitle_id: str
    sample_start_time: float | None = None
    sample_end_time: float | None = None
    sample_word_timestamps: list[WordTimestamp]


class SetCreatedResponse(BaseModel):
    id: str


class SetRenamedResponse(BaseModel):
    id: str
    name: str


class SetDeletedResponse(BaseModel):
    deleted: bool


class SetWordsAddedResponse(BaseModel):
    added: int


class SetWordRemovedResponse(BaseModel):
    removed: bool

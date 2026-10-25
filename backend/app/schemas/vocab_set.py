"""Vocab-set (词单) response schemas (BE-07)."""

from datetime import datetime

from pydantic import BaseModel


class CollectVocabSetResponse(BaseModel):
    id: str
    user_id: str
    video_id: str | None = None
    exam_level: str | None = None
    total: int
    added: int
    existed: bool
    message: str
    last_activity_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class VocabSetSummary(BaseModel):
    id: str
    video_id: str | None = None
    exam_level: str | None = None
    title: str | None = None
    source_type: str | None = None
    thumbnail_url: str | None = None
    total: int
    mastered_count: int
    last_activity_at: datetime | None = None
    created_at: datetime | None = None


class VocabSetWordItem(BaseModel):
    set_word_id: str
    position: int
    status: str
    word: str
    ipa: str | None = None
    translation: str | None = None
    part_of_speech: str | None = None
    definition: str | None = None
    mastery_level: str
    context_sentence: str | None = None
    context_sentence_zh: str | None = None
    exam_level: str | None = None
    subtitle_id: str | None = None
    video_id: str | None = None
    start_time: float | None = None


class VocabSetDetail(VocabSetSummary):
    words: list[VocabSetWordItem]


class SieveWordPayload(BaseModel):
    word: str
    ipa: str | None = None
    translation: str | None = None
    part_of_speech: str | None = None
    definition: str | None = None


class SieveStateResponse(BaseModel):
    set_word_id: str | None = None
    position: int | None = None
    sieved_count: int
    total: int
    mastered_count: int
    pending_count: int
    unknown_count: int
    completed: bool
    word: SieveWordPayload | None = None


class SetWordProgressResponse(BaseModel):
    status: str
    completed: bool
    mastered_count: int
    total: int

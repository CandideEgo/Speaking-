"""Conversation results are suggestions, never implicit attempts or score changes."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TutorReply(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(min_length=1, max_length=1000)
    citation_ids: list[str] = Field(default_factory=list, max_length=3)
    suggested_answer: Literal["A", "B", "C", "D"] | None = None
    source: Literal["policy", "model"]


class DialogueMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    session_id: str
    sequence: int
    session_revision: int
    run_id: str | None
    run_status: str | None
    role: Literal["user", "assistant"]
    body: dict | None
    restricted: bool
    created_at: datetime


class DialoguePage(BaseModel):
    items: list[DialogueMessage]
    next_after: int
    has_more: bool

"""Versioned, bounded task context shared by HTTP, models and external hosts."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.teaching import AttemptResponse, TeachingCard


class ContextModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ContextTask(ContextModel):
    session_id: str
    item_id: str
    status: str
    state: str
    state_version: int
    teaching_policy_version: str


class ContextMaterial(ContextModel):
    kind: Literal["exam_question"] = "exam_question"
    question_key: str
    content_revision_id: str
    source_fingerprint: str
    grading_version: str
    normalization_version: str
    restricted: bool


class ContextHelp(ContextModel):
    hint_level: int
    max_hint_level: int
    feedback_count: int
    answer_available: bool
    analysis_revealed: bool
    history_status: Literal["complete", "unknown"]


class ContextProgress(ContextModel):
    draft_answer: str | None
    draft_revision: int
    answers_visible: bool
    attempt_count: int
    recent_attempts: list[AttemptResponse] = Field(max_length=5)
    attempts_truncated: bool
    help: ContextHelp


class LearningContext(ContextModel):
    schema_version: Literal[1] = 1
    audience: Literal["site", "model", "external"]
    task: ContextTask
    material: ContextMaterial
    progress: ContextProgress
    cards: list[TeachingCard] = Field(max_length=8)
    allowed_actions: list[
        Literal["save_draft", "submit_attempt", "request_hint", "reveal_answer", "record_feedback", "complete_session"]
    ]
    resume_url: str

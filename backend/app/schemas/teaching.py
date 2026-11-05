"""Strict V2 HTTP and content-import contracts; identity never comes from JSON."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateSession(StrictModel):
    operation_id: str = Field(min_length=1, max_length=64)
    content_revision_id: str | None = Field(default=None, min_length=1, max_length=36)
    question_id: str | None = Field(default=None, min_length=1, max_length=36)
    source_exam_answer_id: str | None = Field(default=None, min_length=1, max_length=36)

    @model_validator(mode="after")
    def one_source(self):
        if sum(x is not None for x in (self.content_revision_id, self.question_id, self.source_exam_answer_id)) != 1:
            raise ValueError("Exactly one content or submitted exam reference is required")
        return self


class SessionAction(StrictModel):
    operation_id: str = Field(min_length=1, max_length=64)
    expected_revision: int = Field(ge=1)


class ItemAction(SessionAction):
    item_id: str = Field(min_length=1, max_length=36)


class DraftAnswer(ItemAction):
    answer: str | None = Field(default=None, max_length=64)


class SubmitAttempt(ItemAction):
    answer: str = Field(min_length=1, max_length=64)


class Feedback(ItemAction):
    content: str = Field(min_length=1, max_length=4000)


class CompleteSession(SessionAction):
    action: Literal["complete", "abandon"] = "complete"


class CardHeader(StrictModel):
    schema_version: Literal[1] = 1
    card_id: str
    session_id: str
    item_id: str
    session_revision: int


class QuestionPayload(StrictModel):
    question_key: str
    question_type: Literal["reading"] = "reading"
    passage: str
    question: str
    options: dict[str, str]
    source_url: str


class QuestionCard(CardHeader):
    kind: Literal["question"]
    payload: QuestionPayload


class HintPayload(StrictModel):
    level: int
    text: str


class HintCard(CardHeader):
    kind: Literal["hint"]
    payload: HintPayload


class EvidenceQuote(StrictModel):
    start: int
    end: int
    quote: str


class EvidencePayload(StrictModel):
    quotes: list[EvidenceQuote]


class EvidenceCard(CardHeader):
    kind: Literal["evidence"]
    payload: EvidencePayload


class AnalysisBody(StrictModel):
    summary: str


class AnalysisPayload(StrictModel):
    correct_answer: str
    option_analyses: dict[str, str]
    analysis: AnalysisBody


class AnalysisCard(CardHeader):
    kind: Literal["analysis"]
    payload: AnalysisPayload


class SummaryPayload(StrictModel):
    attempt_count: int
    status: str


class SummaryCard(CardHeader):
    kind: Literal["summary"]
    payload: SummaryPayload


class StatusPayload(StrictModel):
    message: str
    code: str


class StatusCard(CardHeader):
    kind: Literal["status"]
    payload: StatusPayload


TeachingCard = Annotated[
    QuestionCard | HintCard | EvidenceCard | AnalysisCard | SummaryCard | StatusCard,
    Field(discriminator="kind"),
]


class TeachingItemResponse(StrictModel):
    id: str
    question_key: str
    content_revision_id: str
    state: str
    draft_answer: str | None
    draft_revision: int


class AttemptResponse(StrictModel):
    id: str
    item_id: str
    attempt_no: int
    answer: str | None
    correct: bool
    role: str
    answer_origin: str
    server_graded: bool
    assistance_snapshot: dict
    occurred_at: str


class SessionResponse(StrictModel):
    id: str
    user_id: str
    status: str
    revision: int
    current_item_id: str
    policy_version: str
    items: list[TeachingItemResponse]
    attempts: list[AttemptResponse]
    cards: list[TeachingCard] = Field(max_length=8)
    latest_run: dict | None = None
    operation_result: dict | None = None
    replayed: bool = False
    created_at: str
    updated_at: str


class SessionSummary(StrictModel):
    id: str
    status: str
    revision: int
    current_item_id: str | None
    updated_at: str


class SessionListResponse(StrictModel):
    items: list[SessionSummary]


class ContentCatalogItem(StrictModel):
    id: str
    question_key: str
    question_id: str
    status: Literal["auto_verified"]
    paper_id: str
    title: str
    number: int
    level: Literal["cet4"]


class ContentCatalogResponse(StrictModel):
    items: list[ContentCatalogItem]

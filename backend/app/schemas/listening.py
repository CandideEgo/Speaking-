"""Listening practice response schemas (BE-07).

These routes used to return bare dicts, so OpenAPI had no field contracts.
``response_model_exclude_unset=True`` is used for session payloads because an
un-submitted session intentionally omits ``text_en`` / ``text_zh`` /
``grammar_note`` from each question (the test suite pins that), while a
submitted session includes them.
"""

from pydantic import BaseModel

from app.schemas.video import VideoResponse


class ListeningVideoCard(BaseModel):
    video: VideoResponse
    question_count: int


class ListeningQuestion(BaseModel):
    id: str
    start: float
    end: float
    text_en: str | None = None
    text_zh: str | None = None
    grammar_note: str | None = None


class ListeningDiffPart(BaseModel):
    kind: str
    expected: str
    actual: str


class ListeningResult(BaseModel):
    id: str
    answer: str
    correct: bool
    accuracy: int
    diff: list[ListeningDiffPart]


class ListeningSessionResponse(BaseModel):
    id: str
    video_id: str | None = None
    title: str
    video: VideoResponse | None = None
    questions: list[ListeningQuestion]
    answers: dict[str, str]
    results: list[ListeningResult] | None = None
    correct_count: int | None = None
    total: int
    current_index: int
    started_at: str
    updated_at: str
    submitted_at: str | None = None


class ListeningSessionSummary(BaseModel):
    id: str
    title: str
    total: int
    answered: int
    correct_count: int | None = None
    submitted_at: str | None = None
    updated_at: str


class ListeningDraftResponse(BaseModel):
    saved: bool
    updated_at: str

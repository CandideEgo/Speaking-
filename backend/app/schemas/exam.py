"""Pydantic schemas for the 真题测试 (past-paper exam) feature."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.pagination import PaginatedResponse

# ---------------------------------------------------------------------------
# Papers
# ---------------------------------------------------------------------------


class ExamQuestionPublic(BaseModel):
    """Question payload sent to the client BEFORE grading — no answer field."""

    id: str
    number: int
    section: str
    question_type: str
    passage: str | None = None
    question: str | None = None
    options: dict[str, str] | None = None

    model_config = {"from_attributes": True}


class ExamPaperDetail(BaseModel):
    id: str
    level: str
    year: int
    month: int
    set_no: int
    title: str
    source: str | None = None
    total_questions: int
    questions: list[ExamQuestionPublic]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Attempts
# ---------------------------------------------------------------------------


class ExamAttemptCreateResponse(BaseModel):
    session_id: str
    paper_id: str | None = None
    mode: str
    question_count: int
    questions: list[ExamQuestionPublic]


class ExamAnswerSubmit(BaseModel):
    question_id: str
    answer: str = Field(default="", max_length=10)


class ExamSubmitRequest(BaseModel):
    answers: list[ExamAnswerSubmit] = Field(default_factory=list)


class ExamQuestionResult(BaseModel):
    question_id: str
    number: int
    section: str
    question_type: str
    question: str | None = None
    options: dict[str, str] | None = None
    passage: str | None = None
    user_answer: str | None = None
    correct: bool | None = None
    correct_answer: str | None = None
    explanation: str | None = None


class ExamSubmitResponse(BaseModel):
    session_id: str
    mode: str
    score: float
    correct_count: int
    total: int
    part_scores: dict[str, dict[str, float | int]]
    results: list[ExamQuestionResult]


# ---------------------------------------------------------------------------
# Wrong book
# ---------------------------------------------------------------------------


class WrongRedoRequest(BaseModel):
    """Optional body for starting a wrong-redo session.

    ``question_ids`` restricts the session to a subset (e.g. one attempt's
    wrong questions); omitted = redo every aggregated wrong question.
    """

    question_ids: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Response schemas (BE-07: exam lists/stats used to be untyped dicts)
# ---------------------------------------------------------------------------


class ExamPaperSection(BaseModel):
    section: str
    question_count: int


class ExamPaperRow(BaseModel):
    id: str
    level: str
    year: int
    month: int
    set_no: int
    title: str
    source: str | None = None
    total_questions: int
    last_score: float | None = None
    last_submitted_at: datetime | None = None
    last_session_id: str | None = None
    last_correct_count: int | None = None
    last_question_count: int | None = None
    attempt_count: int
    best_score: float | None = None
    sections: list[ExamPaperSection]


class ExamPaperListResponse(PaginatedResponse[ExamPaperRow]):
    available_years: list[int]


class ExamWrongItem(BaseModel):
    question_id: str
    number: int | None = None
    section: str | None = None
    question_type: str | None = None
    passage: str | None = None
    question: str | None = None
    options: dict[str, str] | None = None
    wrong_count: int
    last_wrong_at: datetime | None = None
    paper_id: str | None = None
    paper_title: str | None = None
    level: str | None = None
    year: int | None = None
    month: int | None = None


class ExamStatsResponse(BaseModel):
    month_completed: int
    avg_score: float | None = None
    last_daily_score: float | None = None
    week_daily_count: int


class ExamAttemptItem(BaseModel):
    id: str
    mode: str
    exam_level: str | None = None
    paper_id: str | None = None
    paper_title: str | None = None
    question_count: int
    score: float | None = None
    correct_count: int | None = None
    duration_sec: int
    started_at: datetime | None = None
    submitted_at: datetime | None = None


class ExamAttemptDetailResult(BaseModel):
    question_id: str
    number: int | None = None
    section: str | None = None
    question_type: str | None = None
    question: str | None = None
    options: dict[str, str] | None = None
    passage: str | None = None
    user_answer: str | None = None
    correct: bool | None = None
    correct_answer: str | None = None
    explanation: str | None = None


class ExamAttemptDetailResponse(BaseModel):
    id: str
    mode: str
    exam_level: str | None = None
    paper_id: str | None = None
    question_count: int
    score: float | None = None
    submitted: bool
    part_scores: dict | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    results: list[ExamAttemptDetailResult]

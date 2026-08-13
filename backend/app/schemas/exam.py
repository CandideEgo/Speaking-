"""Pydantic schemas for the 真题测试 (past-paper exam) feature."""

from datetime import datetime

from pydantic import BaseModel, Field

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


class ExamPaperListItem(BaseModel):
    id: str
    level: str
    year: int
    month: int
    set_no: int
    title: str
    source: str | None = None
    total_questions: int
    # Latest attempt info for the current user (null when never attempted).
    last_score: float | None = None
    last_submitted_at: datetime | None = None
    attempt_count: int = 0
    best_score: float | None = None

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


class ExamAttemptListItem(BaseModel):
    id: str
    mode: str
    exam_level: str | None = None
    paper_id: str | None = None
    paper_title: str | None = None
    question_count: int
    score: float | None = None
    correct_count: int | None = None
    duration_sec: int = 0
    started_at: datetime
    submitted_at: datetime | None = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Daily check
# ---------------------------------------------------------------------------


class ExamDailyStartResponse(ExamAttemptCreateResponse):
    pass


# ---------------------------------------------------------------------------
# Wrong book
# ---------------------------------------------------------------------------


class WrongQuestionItem(BaseModel):
    """One aggregated wrong question (deduped by question, latest wrong kept)."""

    question_id: str
    number: int | None = None
    section: str | None = None
    question_type: str | None = None
    passage: str | None = None
    question: str | None = None
    options: dict[str, str] | None = None
    wrong_count: int = 1
    last_wrong_at: datetime | None = None
    paper_id: str | None = None
    paper_title: str | None = None
    level: str | None = None
    year: int | None = None
    month: int | None = None


class WrongRedoRequest(BaseModel):
    """Optional body for starting a wrong-redo session.

    ``question_ids`` restricts the session to a subset (e.g. one attempt's
    wrong questions); omitted = redo every aggregated wrong question.
    """

    question_ids: list[str] = Field(default_factory=list)

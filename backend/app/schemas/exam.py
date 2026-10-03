"""Pydantic schemas for the 真题测试 (past-paper exam) feature."""

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

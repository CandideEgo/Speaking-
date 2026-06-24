from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class VocabularyResponse(BaseModel):
    id: str
    word: str
    definition: str | None = None
    translation: str | None = None
    part_of_speech: str | None = None
    ipa: str | None = None
    example_sentences: list[str] | None = None
    collocations: list[str] | None = None
    difficulty_level: str | None = None
    mastery_level: str
    context_sentence: str | None = None
    video_id: str | None = None
    review_count: int
    next_review_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class VocabularyEnrichResponse(BaseModel):
    id: str
    word: str
    definition: str
    translation: str
    part_of_speech: str
    ipa: str
    example_sentences: list[str]
    collocations: list[str]
    difficulty_level: str

    model_config = {"from_attributes": True}


class QuizGenerateRequest(BaseModel):
    quiz_type: Literal["multiple_choice", "spelling", "context_fill", "translation"]
    count: int = Field(default=10, ge=1, le=30)
    due_only: bool = False


class QuizQuestionResponse(BaseModel):
    id: str
    word: str
    quiz_type: str
    question: str
    options: list[str] | None = None
    correct_answer_index: int | None = None


class QuizAnswerItem(BaseModel):
    question_id: str
    answer: str


class QuizSubmitRequest(BaseModel):
    answers: list[QuizAnswerItem]


class QuizItemResult(BaseModel):
    question_id: str
    correct: bool
    correct_answer: str
    user_answer: str


class QuizSubmitResponse(BaseModel):
    score: int
    total: int
    results: list[QuizItemResult]


class VocabularyStatsResponse(BaseModel):
    total: int
    new_count: int
    learning_count: int
    reviewing_count: int
    mastered_count: int
    due_count: int

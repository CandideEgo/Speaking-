from pydantic import BaseModel


class WordScore(BaseModel):
    """Per-word alignment score from acoustic analysis."""

    word: str
    score: int  # 0-100
    status: str  # "correct" | "partial" | "missing" | "extra"


class CriterionScore(BaseModel):
    """Per-criterion score from rubric-based evaluation."""

    id: str | None = None
    name: str
    score: float  # 0-100
    weight: float
    feedback: str | None = None


class SpeakingSubmitResponse(BaseModel):
    id: str
    accuracy: float
    fluency: float
    completeness: float
    feedback: str
    transcript: str
    word_scores: list[WordScore] | None = None
    audio_duration: float | None = None
    criteria_scores: list[CriterionScore] | None = None
    overall_score: float | None = None


class SpeakingAttemptResponse(BaseModel):
    id: str
    subtitle_id: str | None = None
    accuracy: float | None
    fluency: float | None
    completeness: float | None
    feedback: str | None
    transcript: str | None
    word_scores: list[WordScore] | None = None
    audio_duration: float | None = None
    mode: str = "read_aloud"
    rubric_id: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class FreePracticeResponse(BaseModel):
    """Response for free speaking practice (no reference text)."""

    id: str
    transcript: str
    fluency: float
    feedback: str
    audio_duration: float | None = None
    mode: str = "free_speaking"

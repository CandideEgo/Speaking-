from pydantic import BaseModel


class SpeakingSubmitResponse(BaseModel):
    id: str
    accuracy: float
    fluency: float
    completeness: float
    feedback: str
    transcript: str


class SpeakingAttemptResponse(BaseModel):
    id: str
    subtitle_id: str
    accuracy: float | None
    fluency: float | None
    completeness: float | None
    feedback: str | None
    transcript: str | None
    created_at: str

    model_config = {"from_attributes": True}

from pydantic import BaseModel


class RubricCriterionCreate(BaseModel):
    name: str
    description: str | None = None
    weight: float = 1.0
    sort_order: int = 0


class RubricCreate(BaseModel):
    name: str
    description: str | None = None
    criteria: list[RubricCriterionCreate]


class RubricUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    criteria: list[RubricCriterionCreate] | None = None


class RubricCriterionResponse(BaseModel):
    id: str
    name: str
    description: str | None
    weight: float
    sort_order: int

    model_config = {"from_attributes": True}


class RubricResponse(BaseModel):
    id: str
    name: str
    description: str | None
    is_default: bool
    criteria: list[RubricCriterionResponse]
    created_at: str

    model_config = {"from_attributes": True}


class CriterionScoreResponse(BaseModel):
    criterion_name: str
    score: float
    feedback: str | None = None

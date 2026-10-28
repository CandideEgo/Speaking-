"""Recommendation feed response schemas (BE-07)."""

from pydantic import BaseModel

from app.schemas.video import VideoResponse


class RecommendationHomeResponse(BaseModel):
    items: list[VideoResponse]
    page: int
    page_size: int
    has_more: bool
    total: int
    personalized: bool


class RecommendationCategoryResponse(RecommendationHomeResponse):
    tag: str

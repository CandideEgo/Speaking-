"""Browse response schemas (BE-07)."""

from pydantic import BaseModel

from app.schemas.video import VideoResponse


class Category(BaseModel):
    id: str
    label: str


class CategoriesResponse(BaseModel):
    categories: list[Category]


class FeaturedVideosResponse(BaseModel):
    items: list[VideoResponse]

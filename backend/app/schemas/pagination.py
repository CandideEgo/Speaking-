"""Shared pagination schemas for all API endpoints.

All paginated endpoints should accept `page` (1-based) and `page_size`
query parameters and return the standard PaginatedResponse envelope.

Usage in route handlers:
    from app.schemas.pagination import PaginationParams, PaginatedResponse

    @router.get("")
    async def list_items(pagination: PaginationParams = Depends()):
        ...
        return PaginatedResponse(items=items, page=pagination.page,
                                  page_size=pagination.page_size, has_more=has_more)
"""

from typing import Generic, TypeVar, List
from fastapi import Query
from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class PaginationParams:
    """Reusable pagination dependency for FastAPI route handlers.

    Usage:
        @router.get("")
        async def list_items(pagination: PaginationParams = Depends()):
            offset = pagination.offset
            ...
    """

    def __init__(
        self,
        page: int = Query(1, ge=1, description="Page number (1-based)"),
        page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    ):
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        """Calculate SQL OFFSET from page number."""
        return (self.page - 1) * self.page_size


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated response envelope.

    All paginated endpoints should return this shape:
        { items: [...], page: int, page_size: int, has_more: bool }
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    items: List[T]
    page: int
    page_size: int
    has_more: bool


def has_more(total_count: int, page: int, page_size: int) -> bool:
    """Determine whether there are more results beyond the current page."""
    return total_count > page * page_size

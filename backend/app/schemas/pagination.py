"""Shared pagination schemas for all API endpoints.

All paginated endpoints should accept `page` (1-based) and `page_size`
query parameters and return the standard PaginatedResponse envelope.

Usage in route handlers:
    from app.schemas.pagination import PaginationParams, paginated

    @router.get("")
    async def list_items(pagination: PaginationParams = Depends()):
        ...
        return paginated(items, pagination, total=total)

Or, when total isn't known (fetch-size trick):
    return paginated(items, pagination, has_more=len(items) > page_size)
"""

from typing import Generic, TypeVar

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
        { items: [...], page: int, page_size: int, has_more: bool, total?: int }
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    items: list[T]
    page: int
    page_size: int
    has_more: bool
    total: int | None = None


def has_more(total_count: int, page: int, page_size: int) -> bool:
    """Determine whether there are more results beyond the current page."""
    return total_count > page * page_size


def paginated(
    items: list,
    pagination: PaginationParams | None = None,
    *,
    page: int | None = None,
    page_size: int | None = None,
    total: int | None = None,
    has_more: bool | None = None,
) -> dict:
    """Build the standard pagination envelope dict.

    Pass either ``pagination`` (a PaginationParams from a route dep) or
    explicit ``page``/``page_size`` (e.g. from a service that received ints).

    Either pass ``total`` (a full count; has_more is derived from it) or
    pass ``has_more`` directly (e.g. when using the fetch-size trick and
    the full count isn't known). ``total`` is included in the response
    only when provided.
    """
    if pagination is not None:
        p, ps = pagination.page, pagination.page_size
    elif page is not None and page_size is not None:
        p, ps = page, page_size
    else:
        raise ValueError("paginated() requires either pagination or page+page_size")
    if has_more is None:
        if total is None:
            raise ValueError("paginated() requires either total or has_more")
        has_more = total > p * ps
    envelope: dict = {
        "items": items,
        "page": p,
        "page_size": ps,
        "has_more": has_more,
    }
    if total is not None:
        envelope["total"] = total
    return envelope

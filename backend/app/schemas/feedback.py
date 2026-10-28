"""Feedback schemas - user submission + admin review responses."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class FeedbackCreate(BaseModel):
    """User-submitted feedback payload."""

    category: Literal["suggestion", "bug", "other"] = "suggestion"
    content: str = Field(..., min_length=5, max_length=5000)
    # Optional out-of-band contact (e.g. QQ email). Empty/None = in-app reply only.
    contact: str | None = Field(default=None, max_length=200)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("content must not be empty/whitespace")
        return v

    @field_validator("contact")
    @classmethod
    def contact_stripped(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None


class FeedbackResponse(BaseModel):
    """Feedback row as seen by the user (no admin-only fields)."""

    model_config = {"from_attributes": True}

    id: str
    category: str
    content: str
    contact: str | None
    status: str
    admin_reply: str | None
    created_at: datetime
    updated_at: datetime


class AdminFeedbackResponse(BaseModel):
    """Feedback row as seen by the admin (includes user_id + handler)."""

    model_config = {"from_attributes": True}

    id: str
    user_id: str
    user_name: str | None  # phone redacted, name if available
    category: str
    content: str
    contact: str | None
    status: str
    admin_reply: str | None
    handled_by: str | None
    created_at: datetime
    updated_at: datetime


class AdminFeedbackUpdate(BaseModel):
    """Admin update payload - status transition and/or reply."""

    status: Literal["open", "in_progress", "resolved"] | None = None
    admin_reply: str | None = Field(default=None, max_length=5000)

    @field_validator("admin_reply")
    @classmethod
    def reply_stripped(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None


class AdminFeedbackRow(AdminFeedbackResponse):
    """One row of ``GET /admin/feedback`` (same shape as the PATCH response).

    A named subtype is what makes the list endpoint a real OpenAPI contract:
    before ADM-10 the endpoint declared ``response_model=dict`` and the
    paginated envelope carried no ``total``.
    """


class AnnouncementCreate(BaseModel):
    """Admin broadcast announcement payload."""

    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=2000)
    related_url: str | None = Field(default=None, max_length=500)


class AnnouncementResponse(BaseModel):
    """Result of a broadcast: recipients queued + the announcement body.

    ``notified_count`` is the number of users the fan-out was queued for — the
    actual per-user rows are written by the Celery task (ADM-07). ``queued`` is
    the explicit signal that delivery is asynchronous.
    """

    queued: bool = False
    notified_count: int
    title: str
    message: str

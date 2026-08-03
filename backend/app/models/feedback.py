"""Feedback model - user-submitted feedback / bug reports / suggestions.

Users submit feedback from the /contact page (or the avatar-menu entry). Admins
review and respond via the admin panel. One row per submission; status tracks
the admin workflow (open -> in_progress -> resolved).

``contact`` is optional - populated when the user provides an out-of-band
contact (e.g. QQ email) so admins can reply even if the user never logs in
again. When empty, admins reply in-app via ``admin_reply`` (visible on the
user's "my feedback" view, if built).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Feedback(Base):
    __tablename__ = "feedbacks"
    __table_args__ = (Index("ix_feedbacks_status_created", "status", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "suggestion" | "bug" | "other" - plain string for portability + future
    # categories without a migration.
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="suggestion")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional out-of-band contact (e.g. QQ email). Empty when the user wants
    # an in-app reply only.
    contact: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Admin workflow: "open" -> "in_progress" -> "resolved".
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    # Admin's reply (visible to the user). NULL until the admin responds.
    admin_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Which admin handled this (for audit). NULL until claimed/responded.
    handled_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

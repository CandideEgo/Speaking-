"""Engagement models shared across features (not community-specific).

`VideoLike` powers the watch-page like button and feeds the recommendation
signals `Video.like_count` / `Video.is_featured`. It lived in `models/community.py`
historically but is kept when the social community is removed (ADR-0012), so it
gets its own module to avoid importing the deleted community models.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VideoLike(Base):
    __tablename__ = "video_likes"
    __table_args__ = (UniqueConstraint("video_id", "user_id", name="uq_video_like"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    # relationships
    video = relationship("Video", back_populates="likes")
    user = relationship("User")

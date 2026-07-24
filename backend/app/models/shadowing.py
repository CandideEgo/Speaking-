"""Shadowing (sentence read-along) attempt model — Sprint 1 (E1).

Lightweight shadowing: user records audio per subtitle sentence,
no AI scoring. Replaces the frozen SpeakingAttempt for new data.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ShadowingAttempt(Base):
    __tablename__ = "shadowing_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subtitle_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("subtitles.id", ondelete="SET NULL"), nullable=True
    )
    audio_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_satisfied: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    user = relationship("User")
    video = relationship("Video")
    subtitle = relationship("Subtitle")

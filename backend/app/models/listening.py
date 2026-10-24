"""Durable listening attempts with frozen subtitle references and answer drafts."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ListeningSession(Base):
    __tablename__ = "listening_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    video_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("videos.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    questions: Mapped[list] = mapped_column(JSON, default=list)
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    results: Mapped[list | None] = mapped_column(JSON, nullable=True)
    correct_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_index: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

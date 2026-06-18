import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Float, Text, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class SpeakingAttempt(Base):
    __tablename__ = "speaking_attempts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    subtitle_id: Mapped[str] = mapped_column(String(36), ForeignKey("subtitles.id"), nullable=False)
    audio_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    fluency: Mapped[float | None] = mapped_column(Float, nullable=True)
    completeness: Mapped[float | None] = mapped_column(Float, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", back_populates="speaking_attempts")
    subtitle = relationship("Subtitle", back_populates="speaking_attempts")


class LearningRecord(Base):
    __tablename__ = "learning_records"
    __table_args__ = (
        UniqueConstraint('user_id', 'video_id', name='uq_learning_record_user_video'),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    video_id: Mapped[str] = mapped_column(String(36), ForeignKey("videos.id"), nullable=False)
    words_learned: Mapped[int] = mapped_column(Integer, default=0)
    speaking_attempts: Mapped[int] = mapped_column(Integer, default=0)
    quiz_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", back_populates="learning_records")
    video = relationship("Video", back_populates="learning_records")


class Vocabulary(Base):
    __tablename__ = "vocabulary"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    word: Mapped[str] = mapped_column(String(100), nullable=False)
    context_sentence: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("videos.id"), nullable=True)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", back_populates="vocabulary")

import uuid
from datetime import UTC, datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class SpeakingAttempt(Base):
    __tablename__ = "speaking_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subtitle_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("subtitles.id"), nullable=True)
    audio_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    fluency: Mapped[float | None] = mapped_column(Float, nullable=True)
    completeness: Mapped[float | None] = mapped_column(Float, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    word_scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    audio_duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    mode: Mapped[str] = mapped_column(String(20), default="read_aloud")  # read_aloud/shadowing/free_speaking
    rubric_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("speaking_rubrics.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    user = relationship("User", back_populates="speaking_attempts")
    subtitle = relationship("Subtitle", back_populates="speaking_attempts")
    scores = relationship("SpeakingAttemptScore", back_populates="attempt")


class LearningRecord(Base):
    __tablename__ = "learning_records"
    __table_args__ = (UniqueConstraint("user_id", "video_id", name="uq_learning_record_user_video"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    video_id: Mapped[str] = mapped_column(String(36), ForeignKey("videos.id"), nullable=False)
    words_learned: Mapped[int] = mapped_column(Integer, default=0)
    speaking_attempts: Mapped[int] = mapped_column(Integer, default=0)
    quiz_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Enhanced tracking
    time_spent_seconds: Mapped[int] = mapped_column(Integer, default=0)
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    progress_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    position_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    user = relationship("User", back_populates="learning_records")
    video = relationship("Video", back_populates="learning_records")


class Vocabulary(Base):
    __tablename__ = "vocabulary"
    __table_args__ = (UniqueConstraint("user_id", "word", name="uq_vocabulary_user_word"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    word: Mapped[str] = mapped_column(String(100), nullable=False)
    definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    translation: Mapped[str | None] = mapped_column(String(500), nullable=True)  # Chinese translation
    part_of_speech: Mapped[str | None] = mapped_column(String(20), nullable=True)  # noun/verb/adj/etc
    ipa: Mapped[str | None] = mapped_column(String(100), nullable=True)  # International Phonetic Alphabet
    example_sentences: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # list of example sentences
    collocations: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # list of common collocations
    difficulty_level: Mapped[str | None] = mapped_column(String(5), nullable=True)  # A1-C2
    mastery_level: Mapped[str] = mapped_column(String(20), default="new")  # new/learning/reviewing/mastered
    context_sentence: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("videos.id"), nullable=True)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # SM-2 algorithm fields
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    user = relationship("User", back_populates="vocabulary")
    video = relationship("Video")

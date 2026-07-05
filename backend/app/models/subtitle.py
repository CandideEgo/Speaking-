import uuid

from sqlalchemy import JSON, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Subtitle(Base):
    __tablename__ = "subtitles"
    __table_args__ = (Index("ix_subtitles_video_id_sentence_index", "video_id", "sentence_index"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    start_time: Mapped[float] = mapped_column(Float, nullable=False)
    end_time: Mapped[float] = mapped_column(Float, nullable=False)
    text_en: Mapped[str] = mapped_column(Text, nullable=False)
    text_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    sentence_index: Mapped[int] = mapped_column(Integer, nullable=False)
    speaker: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # AI annotations
    grammar_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty_words: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array

    # CET/高考/考研 exam-level word annotations.
    # Maps lowercase word -> list of canonical exam level keys (see app.core.exam_levels).
    # Computed once at ingest from ECDICT; level-agnostic so display can filter by user target.
    word_levels: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Word-level timestamps from WhisperX alignment: [{word, start, end}, ...].
    # Populated at ingest (transcription callback). Enables precise segment
    # split/merge in the subtitle editor and re-segmentation without re-running
    # forced alignment on the audio. Null for legacy rows and for the
    # faster-whisper fallback path when word timestamps are unavailable.
    words: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # relationships
    video = relationship("Video", back_populates="subtitles")
    speaking_attempts = relationship("SpeakingAttempt", back_populates="subtitle")

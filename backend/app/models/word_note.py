"""Pre-generated AI learning notes for exam vocabulary.

A row stores one (word, level, context_source) triple's contextual note,
pitfalls, and knowledge. Two source kinds coexist:

  * ``global``         — context-agnostic notes, generated once and shared by
                          every video / every user. Pre-heated by the
                          ``scripts/precompute_global_word_notes.py`` script.
  * ``video:{id}``     — notes generated for a specific video, taking its
                          subtitle sentence as context. Produced by the
                          ``prewarm_notes`` step in the video pipeline.

The gloss endpoint prefers the per-video note when present, falls back to
``global``, and only calls the LLM live when neither exists.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WordAINote(Base):
    __tablename__ = "word_ai_notes"
    __table_args__ = (
        UniqueConstraint("word", "level", "context_source", name="uq_word_ai_notes_triple"),
        # Lookup patterns: (word, level) for any-source lookup; (word, source) for
        # the video-specific query; (source) for global preheat enumeration.
        Index("ix_word_ai_notes_word_level", "word", "level"),
        Index("ix_word_ai_notes_word_source", "word", "context_source"),
        Index("ix_word_ai_notes_source", "context_source"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    word: Mapped[str] = mapped_column(String(100), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    # Either "global" or "video:{uuid}" (6 + 36 = 42 chars); 50 gives headroom.
    context_source: Mapped[str] = mapped_column(String(50), nullable=False)
    contextual_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    pitfalls: Mapped[str] = mapped_column(Text, nullable=False, default="")
    knowledge: Mapped[str] = mapped_column(Text, nullable=False, default="")
    model_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    def to_dict(self) -> dict:
        return {
            "contextual_note": self.contextual_note or None,
            "pitfalls": self.pitfalls or None,
            "knowledge": self.knowledge or None,
            "source": self.context_source,
        }

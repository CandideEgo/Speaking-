"""Vocab sets + quick-sieve progress (词汇本「筛选 + 快速过筛」闭环, 产品需求 §4.6).

A ``VocabSet`` is the set of exam words a user collected from one video for
one target exam level — the entry point of the quick-sieve learning loop.
``VocabSetWord`` rows order the set (position 1..N) and carry the sieve
tri-state: pending -> known/unknown -> learned. Mastered tracking
(status IN known/learned) feeds the set list's "unfinished first" sort.

Word data itself lives in the per-user ``Vocabulary`` table (ECDICT-sourced);
these tables only reference it, so deleting a vocab set never deletes the
user's words.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VocabSet(Base):
    __tablename__ = "vocab_sets"
    __table_args__ = (UniqueConstraint("user_id", "video_id", "exam_level", name="uq_vocab_sets_user_video_level"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    video_id: Mapped[str] = mapped_column(String(36), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    # Resolved level key (app.core.exam_levels); nullable only so the unique
    # constraint shape matches the spec — the service always sets a level.
    exam_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    video = relationship("Video")
    words = relationship("VocabSetWord", back_populates="set", cascade="all, delete-orphan")


class VocabSetWord(Base):
    __tablename__ = "vocab_set_words"
    __table_args__ = (Index("ix_vocab_set_words_set_id_position", "set_id", "position"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    set_id: Mapped[str] = mapped_column(String(36), ForeignKey("vocab_sets.id", ondelete="CASCADE"), nullable=False)
    vocabulary_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("vocabulary.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    # pending | known | unknown | learned
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    sieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    learned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    set = relationship("VocabSet", back_populates="words")
    vocabulary = relationship("Vocabulary")

"""Exam-past-paper (真题) corpus — example sentences, word index, and frequency.

Feeds the three-layer 真题 integration of the CET/高考/考研 feature:
  * example layer — gloss endpoint surfaces a real 真题 sentence for a word
  * source layer  — practice-question generation injects 真题 sentences
  * weight layer  — words that appear often in past papers get a "高频" badge

``exam_sentences`` holds one row per 真题 sentence, tagged with level/year.
``exam_sentence_words`` is a (sentence, word) join table so a gloss lookup by
word is an indexed join, not a JSON scan. ``exam_word_freq`` is a precomputed
(word, level) -> count rollup populated by the ETL script, so the "is this
word high-frequency?" check is a single point lookup.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ExamSentence(Base):
    __tablename__ = "exam_sentences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # Canonical exam level key (see app.core.exam_levels), e.g. "cet6".
    level: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Exam month slot, e.g. 6 or 12 (CET runs June/December).
    month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # reading / listening / cloze / translation / writing ...
    question_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    sentence_en: Mapped[str] = mapped_column(Text, nullable=False)
    sentence_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Provenance / paper name, for attribution.
    source: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    words = relationship("ExamSentenceWord", back_populates="sentence", cascade="all, delete-orphan")


class ExamSentenceWord(Base):
    """Join table: lowercased word -> sentence. Indexed for gloss lookup by word."""

    __tablename__ = "exam_sentence_words"
    __table_args__ = (UniqueConstraint("sentence_id", "word", name="uq_exam_sentence_word"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sentence_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("exam_sentences.id", ondelete="CASCADE"), nullable=False, index=True
    )
    word: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    sentence = relationship("ExamSentence", back_populates="words")


class ExamWordFreq(Base):
    """Precomputed (word, level) -> occurrence count across the 真题 corpus."""

    __tablename__ = "exam_word_freq"
    __table_args__ = (UniqueConstraint("word", "level", name="uq_exam_word_freq_word_level"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    word: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    level: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    freq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

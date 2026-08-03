"""Exam sessions and per-question answers for the practice/exam system.

Three session modes:
- ``daily_check``  — cross-video daily check, items drawn from the user's
  favorite/practiced videos at their target exam level.
- ``video_exam``   — exam scoped to a single video's practice set.
- ``wrong_redo``   — redo of previously wrong items; a correct redo clears
  the word from the wrong book.

The wrong book is a *derived* view: exam_answers with ``correct=false`` whose
word has no later correct answer in a ``wrong_redo`` session. No separate
wrong-book table exists by design.

Grading is server-side: the full question snapshot (including the answer) is
stored in ``exam_answers.question`` at session start; the client only sees
answer-stripped items and submits raw answers for grading.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Session modes
MODE_DAILY_CHECK = "daily_check"
MODE_VIDEO_EXAM = "video_exam"
MODE_WRONG_REDO = "wrong_redo"
EXAM_MODES = (MODE_DAILY_CHECK, MODE_VIDEO_EXAM, MODE_WRONG_REDO)


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # One of EXAM_MODES (daily_check | video_exam | wrong_redo).
    mode: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    # Canonical exam level key (see app.core.exam_levels), e.g. "cet4".
    exam_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Only set for video_exam sessions.
    video_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    question_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # 0-100 percentage score, set on submit.
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Per-category breakdown: {category: {"total": N, "correct": M}}.
    part_scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    answers = relationship("ExamAnswer", back_populates="session", cascade="all, delete-orphan")


class ExamAnswer(Base):
    __tablename__ = "exam_answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Full question snapshot (incl. answer) so grading stays server-side.
    question: Mapped[dict] = mapped_column(JSON, nullable=False)
    user_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    session = relationship("ExamSession", back_populates="answers")

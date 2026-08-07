"""真题测试 — paper/question bank + exam session/answer models.

``exam_papers`` / ``exam_questions`` — static past-paper question bank
(CET/高考/考研 objective items: cloze / paragraph-matching / reading).
``exam_sessions`` / ``exam_answers`` — per-user attempt records (tables were
created by the legacy migration ``b1c2d3e4f5a6``); this module maps them and
adds the ``paper_id`` / ``question_id`` links.

Grading is server-side: the client submits raw choices (letter keys) and the
API compares against the stored answer; the answer itself is never sent in
the paper-detail payload.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ExamPaper(Base):
    """One real past-paper set (e.g. 2018-06 CET-4, set 2)."""

    __tablename__ = "exam_papers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # Canonical level key (cet4/cet6/gaoKao/ky/...), see app.core.exam_levels.
    level: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    # Set number within a session (1/2/3 for CET).
    set_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # Provenance / dataset attribution.
    source: Mapped[str] = mapped_column(String(200), nullable=True)
    # Total objective questions (auto-graded) in this paper.
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    questions = relationship("ExamQuestion", back_populates="paper", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("level", "year", "month", "set_no", name="uq_exam_paper_level_year_month_set"),)


class ExamQuestion(Base):
    """One objective question in a paper (reading section items only)."""

    __tablename__ = "exam_questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    paper_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("exam_papers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Section key: reading_A (cloze word bank) / reading_B (paragraph matching) / reading_C (careful reading).
    section: Mapped[str] = mapped_column(String(30), nullable=False)
    # Original question number on the paper (26-55 for CET reading part).
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Reading passage / word bank; paragraph-matching passages live here as one text.
    passage: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Question stem (or statement for matching questions).
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Choice map {"A": "...", "B": "...", ...}; null for cloze blanks whose
    # options are the shared word bank (passage field carries the bank).
    options: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Correct choice letter (A-D / A-O for word bank).
    answer: Mapped[str] = mapped_column(String(10), nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    # cloze / matching / reading
    question_type: Mapped[str] = mapped_column(String(20), nullable=False, default="reading")

    paper = relationship("ExamPaper", back_populates="questions")

    __table_args__ = (UniqueConstraint("paper_id", "number", name="uq_exam_question_paper_number"),)


class ExamSession(Base):
    """One exam attempt (paper exam / daily check / wrong redo)."""

    __tablename__ = "exam_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # paper_exam / daily_check / wrong_redo
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    exam_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    video_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="SET NULL"), nullable=True
    )
    # Paper this attempt belongs to (null for legacy sessions).
    paper_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("exam_papers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    question_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Per-section score map {"reading_A": {"correct": 8, "total": 10}, ...}.
    part_scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    answers = relationship("ExamAnswer", back_populates="session", cascade="all, delete-orphan")


class ExamAnswer(Base):
    """Per-question answer snapshot within an attempt."""

    __tablename__ = "exam_answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("exam_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Question reference (null for legacy snapshot-only rows).
    question_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("exam_questions.id", ondelete="SET NULL"), nullable=True
    )
    # Frozen question snapshot (question text, options, answer) so re-grading
    # stays consistent even if the bank changes later.
    question: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Raw user choice (letter key), null when unanswered.
    user_answer: Mapped[str | None] = mapped_column(String(10), nullable=True)
    correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    session = relationship("ExamSession", back_populates="answers")

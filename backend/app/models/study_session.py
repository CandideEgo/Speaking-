"""Study session models — one training round, persisted (DEC-053).

The vocabulary drill used to keep its progress in React state only: a refresh
or a detour to the player reset the round to zero, and "再来一组" was a full
page reload that re-derived a queue from scratch. These two tables make the
round a server-side object so it can be resumed, counted, and (from S6 on)
driven by per-word scheduling state.

Concepts:
  StudySession      — one round: ``kind=daily`` (the day's quota) or
      ``kind=extra`` (加练, same quota, counted toward today's total but not
      toward today's goal). ``local_date`` is the user's local date so the
      round boundary matches LearningEvent's day boundary.
  StudySessionItem  — one row per word **per round**; repeated answers UPDATE
      the row (``correct_streak`` / ``wrong_in_round`` / ``status``) instead of
      appending a new one, which is what keeps the storage bounded.

``correct_streak`` / ``wrong_in_round`` are the scheduling state of design
§5.1-§5.3: answer right → streak +1, answer wrong → streak 0, graduate at
streak 2; ``wrong_in_round`` decides whether the word's first review is
tomorrow (wrong) or in 3 days (clean).
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _uuid_str() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(UTC)


class StudySession(Base):
    """One training round for one user.

    ``status`` is a small state machine: ``active`` while the round is being
    worked through, ``finished`` once the frontend closes it (or once every
    item has graduated), ``abandoned`` if the round is closed without being
    completed. Only ``active`` rounds are resumed — see
    ``study_session_service.get_active_session``.
    """

    __tablename__ = "study_sessions"
    __table_args__ = (
        # Resume lookup: the user's one active round.
        Index("ix_study_sessions_user_status", "user_id", "status"),
        # Today's rounds (count for 今日已学 · 第 K 轮) and the retention sweep.
        Index("ix_study_sessions_user_date", "user_id", "local_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # The user's local date (from UserPreferences.reminder_timezone), so a round
    # never straddles the same boundary LearningEvent uses for daily counters.
    local_date: Mapped[date] = mapped_column(Date, nullable=False)

    # "daily" (今日配额) | "extra" (加练)
    kind: Mapped[str] = mapped_column(String(10), nullable=False, default="daily")

    # Quota the round was created with (snapshot: changing the quota later must
    # not rewrite history) and the running tallies.
    target_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    done_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # "active" | "finished" | "abandoned"
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="active", index=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
    items = relationship(
        "StudySessionItem",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="StudySessionItem.sort_order",
    )


class StudySessionItem(Base):
    """One word inside one round. Repeated answers UPDATE this row.

    ``status``: ``pending`` (never answered) → ``learning`` (answered, streak
    below the graduation threshold) → ``graduated`` (streak reached 2, out of
    the round's queue).
    """

    __tablename__ = "study_session_items"
    __table_args__ = (
        UniqueConstraint("session_id", "vocabulary_id", name="uq_study_session_item"),
        Index("ix_study_session_items_vocabulary", "vocabulary_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("study_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vocabulary_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("vocabulary.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Queue position inside the round, so a resumed round renders in the order
    # it was created (the round's order is part of the experience, not an
    # implementation detail of the query).
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Scheduling state (design §5.1-§5.3)
    correct_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wrong_in_round: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # "pending" | "learning" | "graduated"
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )

    session = relationship("StudySession", back_populates="items")
    vocabulary = relationship("Vocabulary")

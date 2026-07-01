"""Daily activity tracking — one row per user per day.

Pre-computed daily snapshots make dashboard queries O(1) instead of
aggregating over thousands of speaking_attempts rows on every page load.
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DailyActivity(Base):
    __tablename__ = "daily_activities"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_daily_activity_user_date"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Activity counts
    speaking_attempts: Mapped[int] = mapped_column(Integer, default=0)
    words_reviewed: Mapped[int] = mapped_column(Integer, default=0)
    words_added: Mapped[int] = mapped_column(Integer, default=0)
    videos_watched: Mapped[int] = mapped_column(Integer, default=0)
    quizzes_taken: Mapped[int] = mapped_column(Integer, default=0)

    # Score aggregates (computed from speaking_attempts that day)
    avg_accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_fluency: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_completeness: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Time tracking
    time_spent_seconds: Mapped[int] = mapped_column(Integer, default=0)

    # Streak computation helper — True when user met their daily goal
    goal_met: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user = relationship("User", back_populates="daily_activities")

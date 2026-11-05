"""Cross-session assistance facts; an absent mapping is never an independent baseline."""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserQuestionExposure(Base):
    __tablename__ = "user_question_exposures"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    question_key: Mapped[str] = mapped_column(String(160), primary_key=True)
    max_hint_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    feedback_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    first_answer_available_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    origin: Mapped[str] = mapped_column(String(40), nullable=False, default="unknown")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class UserExposureMappingState(Base):
    __tablename__ = "user_exposure_mapping_states"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

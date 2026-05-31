import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
import enum


class PlanType(str, enum.Enum):
    free = "free"
    pro = "pro"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    level: Mapped[str | None] = mapped_column(String(10), nullable=True)  # A1-C2
    plan: Mapped[PlanType] = mapped_column(
        SAEnum(PlanType), default=PlanType.free, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # relationships
    videos = relationship("Video", back_populates="user")
    speaking_attempts = relationship("SpeakingAttempt", back_populates="user")
    learning_records = relationship("LearningRecord", back_populates="user")
    vocabulary = relationship("Vocabulary", back_populates="user")

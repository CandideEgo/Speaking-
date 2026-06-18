import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class NotificationType(str, enum.Enum):
    system = "system"
    video_ready = "video_ready"
    pro_expiring = "pro_expiring"
    vocabulary_reminder = "vocabulary_reminder"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    related_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # relationships
    user = relationship("User", back_populates="notifications")

import enum
import uuid
from datetime import UTC, datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class NotificationType(str, enum.Enum):
    system = "system"
    video_ready = "video_ready"
    pro_expiring = "pro_expiring"
    vocabulary_reminder = "vocabulary_reminder"
    streak_warning = "streak_warning"
    achievement_unlocked = "achievement_unlocked"
    comment_reply = "comment_reply"
    social_follow = "social_follow"
    post_liked = "post_liked"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    related_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    data: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON payload
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    user = relationship("User", back_populates="notifications")

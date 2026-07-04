"""User preferences model — notification opt-ins and other user settings."""

import uuid
from datetime import UTC, datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Default notification preferences — all types enabled
DEFAULT_NOTIFICATION_PREFS: dict = {
    "system": True,
    "comment": True,
    "like": True,
    "video_ready": True,
    "speaking_feedback": True,
    "achievement": True,
    "marketing": False,
}


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    notification_preferences: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        default=lambda: DEFAULT_NOTIFICATION_PREFS.copy(),
        comment="Dict of notification type -> bool opt-in. Null means all enabled.",
    )
    daily_goal_type: Mapped[str] = mapped_column(String(20), default="words")
    daily_goal_value: Mapped[int] = mapped_column(Integer, default=5)
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reminder_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    reminder_timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    auto_play_next_subtitle: Mapped[bool] = mapped_column(Boolean, default=True)
    subtitle_mode_default: Mapped[str] = mapped_column(String(20), default="bilingual")
    preferred_difficulty: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # User's target exam level (canonical key from app.core.exam_levels, e.g. "cet4").
    # Drives which annotated words are highlighted on the watch page.
    target_exam: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # relationships
    user = relationship("User", back_populates="preferences")

    def get_notification_pref(self, notification_type: str) -> bool:
        """Check if a notification type is opted-in. Defaults to True if not set."""
        if self.notification_preferences is None:
            return True
        return self.notification_preferences.get(notification_type, True)

"""Free-tier video unlocks — permanent per-user video access grants (D0).

Free users get a monthly unlock quota (``settings.free_monthly_unlock_quota``).
Unlocking a video consumes one of the current month's quotas but grants
*permanent* access — the row never expires and re-watching never re-consumes.
Quotas reset on the 1st of each month (unused quotas do not roll over).

Pro viewing never writes rows here; if a Pro user is later downgraded to
Free, videos watched during Pro require a fresh unlock (deliberate simplicity,
see .agent/decisions.md 2026-08-28).
"""

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserVideoUnlock(Base):
    __tablename__ = "user_video_unlocks"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    video_id: Mapped[str] = mapped_column(String(36), ForeignKey("videos.id", ondelete="CASCADE"), primary_key=True)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    user = relationship("User", back_populates="video_unlocks")
    video = relationship("Video", back_populates="unlocks")

"""User-owned subscriptions and saved subtitle references."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ChannelSubscription(Base):
    __tablename__ = "channel_subscriptions"
    __table_args__ = (UniqueConstraint("user_id", "channel_id", name="uq_channel_subscriptions_user_channel"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    channel_id: Mapped[str] = mapped_column(String(36), ForeignKey("channels.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class SentenceFavorite(Base):
    __tablename__ = "sentence_favorites"
    __table_args__ = (UniqueConstraint("user_id", "subtitle_id", name="uq_sentence_favorites_user_subtitle"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subtitle_id: Mapped[str] = mapped_column(String(36), ForeignKey("subtitles.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

"""Official curated video channels (ADR-0014).

Channels are an admin-maintained "content source" dimension, orthogonal to
the topic-tag dimension used by recommendations. The scraped upstream fields
on Video (``channel_id`` / ``channel_name``) stay as external metadata; this
table is the in-site curation identity (ordering / cover / description /
visibility / slug routing). ``Channel.upstream_channel_id`` bridges the two:
videos are auto-attached by matching their scraped ``channel_id``.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    # Upstream (YouTube/Bilibili) channel id; registering it lets ingest and
    # the backfill script attach matching videos automatically.
    upstream_channel_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

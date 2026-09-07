"""Catalog candidate pool for curated video ingestion.

The catalog is a *staging area* for scraped/discovered video candidates that
are NOT yet SeeWord ``Video`` rows. Admins browse the pool and promote items one
at a time into the real ingestion pipeline (``seed_video`` -> process ->
publish). This decouples bulk discovery (e.g. the Language Reactor YouTube
catalog scrape) from the deliberate, per-item "process one, publish one"
curation workflow the product wants for official content.

Each row keeps the lossless scraped record in ``raw_meta`` plus the normalized
columns the admin list filters/sorts on. ``promoted_video_id`` links to the
``Video`` created on promotion; the item's *effective* status is derived from
that video's live pipeline status when listed (no beat task needed for MVP).
"""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CatalogStatus(str, enum.Enum):
    """Lifecycle of a catalog candidate.

    Stored as a plain ``String`` column (not a native enum) so migrations
    backfill cleanly across SQLite (tests) and Postgres (prod) — same
    convention as ``Video.review_status``.

    - ``new``: scraped in, not yet acted on.
    - ``queued``: admin marked it as a next-up candidate (optional holding state).
    - ``processing``: promoted — a ``Video`` exists and its pipeline is running.
    - ``published``: the promoted ``Video`` reached ready + published.
    - ``skipped``: admin rejected the candidate; it will not be promoted.
    - ``error``: promotion/processing failed (admin can retry or skip).
    """

    new = "new"
    queued = "queued"
    processing = "processing"
    published = "published"
    skipped = "skipped"
    error = "error"


class CatalogItem(Base):
    __tablename__ = "catalog_items"
    __table_args__ = (
        # One row per (source, upstream video id) — makes imports idempotent.
        Index("ix_catalog_source_upstream", "source", "upstream_id", unique=True),
        # Admin list default view: filter by status, order by SeeWord-fit.
        Index("ix_catalog_status_fit", "status", "fit_score"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Provenance of the candidate (e.g. "languagereactor").
    source: Mapped[str] = mapped_column(String(60), nullable=False, default="languagereactor")
    # Upstream (YouTube) video id; unique per source via ix_catalog_source_upstream.
    upstream_id: Mapped[str] = mapped_column(String(64), nullable=False)
    source_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="")

    # Upstream channel metadata — used to auto-attach a Channel on promotion
    # (channel_service.ensure_channel_for matches on channel_id).
    channel_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    channel_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # External (YouTube-side) stats exactly as scraped. Distinct from the in-app
    # counters a promoted Video keeps (mirrors Video.ext_view_count semantics).
    ext_view_count: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    publish_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    subs_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    # Source-provided difficulty / popularity signals (Language Reactor exposes
    # freqRank95 = 95%-frequency vocab rank, and a popularity score).
    freq_rank95: Mapped[int | None] = mapped_column(Integer, nullable=True)
    popularity_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # SeeWord-fit score (0-100) computed at import from duration / difficulty /
    # channel / subtitle availability — drives default list ordering so the best
    # learning candidates lead instead of the source's date ordering.
    fit_score: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)

    status: Mapped[str] = mapped_column(
        String(20), default=CatalogStatus.new.value, server_default="new", nullable=False
    )

    # Lossless scraped record (title/description/all metrics) for later
    # re-derivation without re-scraping.
    raw_meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Link to the Video created on promotion. SET NULL on delete so the catalog
    # history survives a promoted video being removed.
    promoted_video_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("videos.id", ondelete="SET NULL"), nullable=True, index=True
    )
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

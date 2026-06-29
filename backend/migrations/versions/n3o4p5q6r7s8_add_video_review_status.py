"""add video review status (UGC)

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-06-30 00:00:00.000000

Adds the UGC review lifecycle to ``videos``:
- ``review_status`` (draft/pending_review/published/rejected) — the visibility
  gate for user-uploaded videos (official videos stay public via is_official).
- ``submitted_at`` / ``reviewed_by`` / ``reviewed_at`` / ``rejection_reason`` —
  review audit fields.
- ``published_snapshot`` (JSON) — frozen last-approved subtitles shown to the
  public while the owner edits a pending/rejected version.

Backfill: videos that are official or already published are marked
``published`` so nothing currently visible disappears; everything else starts
as ``draft`` (owner can edit & submit for review).
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "n3o4p5q6r7s8"
down_revision: str | None = "m2n3o4p5q6r7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column("review_status", sa.String(length=20), nullable=False, server_default="draft"),
    )
    op.add_column("videos", sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "videos",
        sa.Column("reviewed_by", sa.String(length=36), nullable=True),
    )
    op.add_column("videos", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("videos", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.add_column("videos", sa.Column("published_snapshot", sa.JSON(), nullable=True))

    # Backfill: official or already-published videos become 'published' so the
    # public keeps seeing them. (Plain SQL — works on SQLite and Postgres.)
    op.execute("UPDATE videos SET review_status = 'published' WHERE is_official = true OR is_published = true")


def downgrade() -> None:
    op.drop_column("videos", "published_snapshot")
    op.drop_column("videos", "rejection_reason")
    op.drop_column("videos", "reviewed_at")
    op.drop_column("videos", "reviewed_by")
    op.drop_column("videos", "submitted_at")
    op.drop_column("videos", "review_status")

"""Catalog candidate pool table (catalog_items).

Staging area for scraped/discovered video candidates that are not yet SeeWord
``Video`` rows. Admins promote items one at a time into the ingestion pipeline
("process one, publish one"). Decouples bulk discovery from deliberate curation.

Revision ID: f1g2h3i4j5k6
Revises: e0f1g2h3i4j5
Create Date: 2026-09-08 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "f1g2h3i4j5k6"
down_revision: str | None = "e0f1g2h3i4j5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "catalog_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source", sa.String(length=60), nullable=False),
        sa.Column("upstream_id", sa.String(length=64), nullable=False),
        sa.Column("source_url", sa.String(length=2000), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("channel_id", sa.String(length=64), nullable=True),
        sa.Column("channel_name", sa.String(length=255), nullable=True),
        sa.Column("ext_view_count", sa.BigInteger(), nullable=True),
        sa.Column("duration_sec", sa.Integer(), nullable=True),
        sa.Column("publish_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("thumbnail_url", sa.String(length=2000), nullable=True),
        sa.Column("subs_available", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("freq_rank95", sa.Integer(), nullable=True),
        sa.Column("popularity_score", sa.Integer(), nullable=True),
        sa.Column("fit_score", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="new", nullable=False),
        sa.Column("raw_meta", sa.JSON(), nullable=True),
        sa.Column("promoted_video_id", sa.String(length=36), nullable=True),
        sa.Column("admin_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("promoted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["promoted_video_id"], ["videos.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_catalog_source_upstream", "catalog_items", ["source", "upstream_id"], unique=True)
    op.create_index("ix_catalog_status_fit", "catalog_items", ["status", "fit_score"], unique=False)
    op.create_index("ix_catalog_items_fit_score", "catalog_items", ["fit_score"], unique=False)
    op.create_index("ix_catalog_items_promoted_video_id", "catalog_items", ["promoted_video_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_catalog_items_promoted_video_id", table_name="catalog_items")
    op.drop_index("ix_catalog_items_fit_score", table_name="catalog_items")
    op.drop_index("ix_catalog_status_fit", table_name="catalog_items")
    op.drop_index("ix_catalog_source_upstream", table_name="catalog_items")
    op.drop_table("catalog_items")

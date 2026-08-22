"""Add channels table and videos.channel_ref (ADR-0014)

Official curated channels: admin-maintained content-source dimension,
orthogonal to topic tags. videos.channel_ref links a video to its in-site
channel (SET NULL on delete).

Revision ID: b2c3d4e5f6a7
Revises: a7b8c9d0e1f2
Create Date: 2026-08-20 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "channels",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_url", sa.String(length=2000), nullable=True),
        sa.Column("upstream_channel_id", sa.String(length=64), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_channels_slug", "channels", ["slug"], unique=True)
    op.create_index("ix_channels_upstream_channel_id", "channels", ["upstream_channel_id"])

    op.add_column("videos", sa.Column("channel_ref", sa.String(length=36), nullable=True))
    op.create_foreign_key(
        "fk_videos_channel_ref_channels", "videos", "channels", ["channel_ref"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_videos_channel_ref", "videos", ["channel_ref"])


def downgrade() -> None:
    op.drop_index("ix_videos_channel_ref", table_name="videos")
    op.drop_constraint("fk_videos_channel_ref_channels", "videos", type_="foreignkey")
    op.drop_column("videos", "channel_ref")
    op.drop_index("ix_channels_upstream_channel_id", table_name="channels")
    op.drop_index("ix_channels_slug", table_name="channels")
    op.drop_table("channels")

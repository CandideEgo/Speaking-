"""add subtitle_resegment_snapshots table

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-05 15:00:00.000000

Creates ``subtitle_resegment_snapshots`` for the bulk re-segment + rollback
feature. Each row snapshots every subtitle of a video before an admin
re-cuts segmentation, so a bad re-cut can be rolled back row-for-row.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "b2c3d4e5f6g7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "subtitle_resegment_snapshots" not in inspector.get_table_names():
        op.create_table(
            "subtitle_resegment_snapshots",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column(
                "video_id",
                sa.String(length=36),
                sa.ForeignKey("videos.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("segments_json", sa.JSON(), nullable=False),
            sa.Column("before_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("after_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "applied_by",
                sa.String(length=36),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("rolled_back", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("rolled_back_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_table("subtitle_resegment_snapshots")

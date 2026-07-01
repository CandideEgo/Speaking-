"""add video like_count, favorite_count, video_likes table

Revision ID: o4p5q6r7s8t9
Revises: n3o4p5q6r7s8
Create Date: 2026-07-01 00:00:00.000000

Adds denormalized social counts to ``videos`` and creates the
``video_likes`` table for toggle-like functionality:

- ``like_count`` (Integer, default 0) — denormalized count of VideoLike rows.
- ``favorite_count`` (Integer, default 0) — denormalized count of UserFavorite rows.
- ``video_likes`` table with (video_id, user_id) unique constraint.

Backfill: favorite_count is populated from existing user_favorites rows;
like_count starts at 0 (no VideoLike rows exist yet).
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "o4p5q6r7s8t9"
down_revision: str | None = "n3o4p5q6r7s8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add like_count column (default 0, server_default "0")
    op.add_column("videos", sa.Column("like_count", sa.Integer(), nullable=False, server_default="0"))
    # Add favorite_count column (default 0, server_default "0")
    op.add_column("videos", sa.Column("favorite_count", sa.Integer(), nullable=False, server_default="0"))

    # Backfill favorite_count from existing user_favorites
    op.execute(
        "UPDATE videos SET favorite_count = COALESCE("
        "(SELECT COUNT(*) FROM user_favorites WHERE user_favorites.video_id = videos.id), "
        "0)"
    )

    # Create video_likes table
    op.create_table(
        "video_likes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "video_id", sa.String(36), sa.ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True
        ),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("video_id", "user_id", name="uq_video_like"),
    )


def downgrade() -> None:
    op.drop_table("video_likes")
    op.drop_column("videos", "favorite_count")
    op.drop_column("videos", "like_count")

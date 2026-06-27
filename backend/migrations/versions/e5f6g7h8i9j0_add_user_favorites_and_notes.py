"""add user_favorites and user_notes

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-06-25 12:00:00.000000

Adds ``user_favorites`` (per-video bookmarks) and ``user_notes`` (per-video
free-text notes). Both scoped to (user, video) with a unique constraint, so
favorites and notes follow the user's account across devices instead of living
only in the browser's localStorage.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "e5f6g7h8i9j0"
down_revision: str | None = "d4e5f6g7h8i9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_favorites",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("video_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "video_id", name="uq_user_favorite_user_video"),
    )
    op.create_index("ix_user_favorites_user_id", "user_favorites", ["user_id"])
    op.create_index("ix_user_favorites_video_id", "user_favorites", ["video_id"])

    op.create_table(
        "user_notes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("video_id", sa.String(length=36), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["video_id"], ["videos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "video_id", name="uq_user_note_user_video"),
    )
    op.create_index("ix_user_notes_user_id", "user_notes", ["user_id"])
    op.create_index("ix_user_notes_video_id", "user_notes", ["video_id"])


def downgrade() -> None:
    op.drop_index("ix_user_notes_video_id", table_name="user_notes")
    op.drop_index("ix_user_notes_user_id", table_name="user_notes")
    op.drop_table("user_notes")
    op.drop_index("ix_user_favorites_video_id", table_name="user_favorites")
    op.drop_index("ix_user_favorites_user_id", table_name="user_favorites")
    op.drop_table("user_favorites")

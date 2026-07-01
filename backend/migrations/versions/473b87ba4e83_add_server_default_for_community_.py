"""add server_default for community counter columns

Revision ID: 473b87ba4e83
Revises: s8t9u0v1w2x3
Create Date: 2026-07-01 22:26:15.218788
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "473b87ba4e83"
down_revision: str | None = "s8t9u0v1w2x3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Backfill any NULL counters to 0 before adding NOT NULL constraint
    op.execute("UPDATE posts SET like_count = 0 WHERE like_count IS NULL")
    op.execute("UPDATE posts SET comment_count = 0 WHERE comment_count IS NULL")
    op.execute("UPDATE user_comments SET like_count = 0 WHERE like_count IS NULL")

    # Set server_default so rows inserted via raw SQL get 0 instead of NULL
    op.alter_column("posts", "like_count", server_default="0", existing_type=sa.Integer())
    op.alter_column("posts", "comment_count", server_default="0", existing_type=sa.Integer())
    op.alter_column("user_comments", "like_count", server_default="0", existing_type=sa.Integer())


def downgrade() -> None:
    op.alter_column("user_comments", "like_count", server_default=None, existing_type=sa.Integer())
    op.alter_column("posts", "comment_count", server_default=None, existing_type=sa.Integer())
    op.alter_column("posts", "like_count", server_default=None, existing_type=sa.Integer())

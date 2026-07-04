"""add comment_count to videos

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-06-25 02:15:00.000000

Adds the ``comment_count`` denormalised counter to the ``videos`` table.

This column is declared on the ``Video`` model and present in the consolidated
initial schema migration, but some databases that were created from an earlier
migration state (before the ``refactor(db): 合并迁移为单一 initial schema`` merge)
were stamped to head without ever physically receiving the column. This makes
the schema match the model so queries that select ``videos.comment_count`` (e.g.
the homepage "continue learning" join) stop raising UndefinedColumnError.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "d4e5f6g7h8i9"
down_revision: str | None = "c3d4e5f6g7h8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "videos",
        sa.Column("comment_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("videos", "comment_count")

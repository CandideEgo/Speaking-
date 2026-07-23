"""Drop dead User columns: streak_count, longest_streak

These columns have no write path (activity_service was deleted in ADR-0003).
They always read as 0. Removing them from the schema and model to clean up
unused data.

Revision ID: z9y8x7w6v5u4
Revises: r3e4d5e6e7m8
Create Date: 2026-07-23 00:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "z9y8x7w6v5u4"
down_revision: str | None = "r3e4d5e6e7m8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("users", "streak_count")
    op.drop_column("users", "longest_streak")


def downgrade() -> None:
    op.add_column("users", sa.Column("streak_count", sa.Integer(), nullable=False, server_default=sa.text("0")))
    op.add_column("users", sa.Column("longest_streak", sa.Integer(), nullable=False, server_default=sa.text("0")))

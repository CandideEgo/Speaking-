"""add videos.title_zh

Revision ID: n5o6p7q8r9s0
Revises: m4n5o6p7q8r9
Create Date: 2026-10-22 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "n5o6p7q8r9s0"
down_revision: str | None = "m4n5o6p7q8r9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("videos", sa.Column("title_zh", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("videos", "title_zh")

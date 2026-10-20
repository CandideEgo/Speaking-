"""persist subtitle coverage for home content generation

Revision ID: m4n5o6p7q8r9
Revises: m3n4o5p6q7r8
Create Date: 2026-10-20 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "m4n5o6p7q8r9"
down_revision: str | None = "m3n4o5p6q7r8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("home_content_drafts", sa.Column("generation_coverage", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("home_content_drafts", "generation_coverage")

"""add user is_banned

Revision ID: j9k0l1m2n3o4
Revises: i8h9c0d1e2f3
Create Date: 2026-06-26 12:00:00.000000

Adds ``is_banned`` boolean column to the ``users`` table so the admin panel
can suspend accounts without deleting them. Defaults to ``false``.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "j9k0l1m2n3o4"
down_revision: str | None = "i8h9c0d1e2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_banned", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("users", "is_banned")

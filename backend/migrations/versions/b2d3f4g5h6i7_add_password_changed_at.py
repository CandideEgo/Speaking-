"""add password_changed_at to users

Revision ID: b2d3f4g5h6i7
Revises: a1c2e3f4g5h6
Create Date: 2026-06-24 11:00:00.000000

Adds ``password_changed_at`` so that tokens issued before a password change or
reset can be detected and rejected by the auth dependency, invalidating all of
a user's active sessions. Existing rows are backfilled to their ``created_at``
so they are not treated as stale on first deploy.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "b2d3f4g5h6i7"
down_revision: str | None = "a1c2e3f4g5h6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
    # Backfill existing users so their current tokens remain valid.
    op.execute("UPDATE users SET password_changed_at = created_at")
    op.alter_column("users", "password_changed_at", nullable=False)


def downgrade() -> None:
    op.drop_column("users", "password_changed_at")

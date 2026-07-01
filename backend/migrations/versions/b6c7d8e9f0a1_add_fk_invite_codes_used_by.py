"""add FK on invite_codes.used_by → users.id with SET NULL

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-07-02 00:10:00.000000

Before adding the FK, backfill any orphaned used_by values (user was
deleted but the string reference survived).  SET NULL means future user
deletions will cleanly nullify the column instead of leaving a dangling
reference.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "b6c7d8e9f0a1"
down_revision: str | None = "a5b6c7d8e9f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullify any used_by values that don't reference an existing user
    op.execute(
        """
        UPDATE invite_codes
        SET used_by = NULL
        WHERE used_by IS NOT NULL
          AND used_by NOT IN (SELECT id FROM users)
        """
    )
    op.create_foreign_key(
        "fk_invite_codes_used_by_users",
        "invite_codes",
        "users",
        ["used_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_invite_codes_used_by_users",
        "invite_codes",
        type_="foreignkey",
    )

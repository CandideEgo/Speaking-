"""add_pending_processing_status

Revision ID: 87140393fa0e
Revises: f92a8f2617d9
Create Date: 2026-07-02 04:00:27.680934
"""

from collections.abc import Sequence
from typing import Union

from alembic import op

# revision identifiers
revision: str = "87140393fa0e"
down_revision: str | None = "f92a8f2617d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add 'pending_processing' value to the videostatus enum type.

    PostgreSQL ALTER TYPE ... ADD VALUE cannot run inside a transaction,
    but Alembic 1.11+ handles this automatically via op.execute().
    """
    op.execute("ALTER TYPE videostatus ADD VALUE IF NOT EXISTS 'pending_processing'")


def downgrade() -> None:
    """Removing an enum value in PostgreSQL requires recreating the type.

    This is a no-op for safety — downgrading is rarely needed and
    removing the value would fail if any rows still reference it.
    """
    # Intentionally left empty — PostgreSQL does not support
    # ALTER TYPE ... DROP VALUE easily (requires type rebuild).
    pass

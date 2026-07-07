"""merge heads

Revision ID: 3909bc9d97cd
Revises: d6e7f8a9b0c1, x5y6z7a8b9c0
Create Date: 2026-07-07 05:03:11.387942
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "3909bc9d97cd"
down_revision: str | None = ("d6e7f8a9b0c1", "x5y6z7a8b9c0")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

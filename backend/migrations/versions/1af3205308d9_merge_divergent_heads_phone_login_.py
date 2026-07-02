"""merge divergent heads phone_login + processing_started_at

Revision ID: 1af3205308d9
Revises: a9c1d2e3f4b5, t9u0v1w2x3y4
Create Date: 2026-07-03 04:22:24.331319
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "1af3205308d9"
down_revision: str | None = ("a9c1d2e3f4b5", "t9u0v1w2x3y4")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

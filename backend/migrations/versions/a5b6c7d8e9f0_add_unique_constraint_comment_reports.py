"""add unique constraint on comment_reports (comment_id, reporter_id)

Revision ID: a5b6c7d8e9f0
Revises: 473b87ba4e83
Create Date: 2026-07-01 23:30:00.000000

Prevents duplicate reports from the same user on the same comment.
Deduplicate any existing duplicates before adding the constraint.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "a5b6c7d8e9f0"
down_revision: str | None = "473b87ba4e83"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Deduplicate: keep the earliest report per (comment_id, reporter_id)
    op.execute(
        """
        DELETE FROM comment_reports
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM comment_reports
            GROUP BY comment_id, reporter_id
        )
        """
    )
    op.create_unique_constraint(
        "uq_comment_report_comment_reporter",
        "comment_reports",
        ["comment_id", "reporter_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_comment_report_comment_reporter",
        "comment_reports",
        type_="unique",
    )

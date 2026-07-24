"""Add vocabulary plan enhancement columns (ADR-0012)

Three new columns on the vocabulary table to support the learning plan feature:
  exam_level — the exam level this word was learned under (e.g. "cet4"),
      enabling per-level mastery breakdowns in the learning profile
  first_seen_at — when the word first entered the vocabulary, distinct from
      created_at (needed for "words learned this week" metrics)
  correct_count — cumulative correct answers, distinct from review_count
      (enables accuracy tracking for strengths/weaknesses)

Revision ID: d2e3f4g5h6i7
Revises: c1d2e3f4g5h6
Create Date: 2026-07-24 00:00:00.000000
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "d2e3f4g5h6i7"
down_revision: str | None = "c1d2e3f4g5h6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("vocabulary", sa.Column("exam_level", sa.String(length=20), nullable=True))
    op.add_column("vocabulary", sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("vocabulary", sa.Column("correct_count", sa.Integer(), server_default=sa.text("0"), nullable=False))


def downgrade() -> None:
    op.drop_column("vocabulary", "correct_count")
    op.drop_column("vocabulary", "first_seen_at")
    op.drop_column("vocabulary", "exam_level")

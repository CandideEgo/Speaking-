"""add subtitle.word_levels and user_preferences.target_exam

Revision ID: f6a7b8c9d0e1
Revises: e5f6g7h8i9j0
Create Date: 2026-06-25 13:00:00.000000

Adds two columns for the CET/高考/考研 vocabulary feature:

- ``subtitles.word_levels`` (JSON): per-subtitle map of lowercase word -> list
  of canonical exam level keys. Computed once at ingest from ECDICT; stored
  level-agnostic so the watch page can filter by the user's target exam.
- ``user_preferences.target_exam`` (String): the user's target exam level key
  (e.g. "cet4"), driving which annotated words are highlighted.
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6g7h8i9j0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Some DBs were stamped to head without receiving physical columns (see
    # d4e5f6g7h8i9 migration note), so guard add_column with a check.
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    subtitles_cols = {c["name"] for c in inspector.get_columns("subtitles")}
    if "word_levels" not in subtitles_cols:
        op.add_column("subtitles", sa.Column("word_levels", sa.JSON(), nullable=True))

    prefs_cols = {c["name"] for c in inspector.get_columns("user_preferences")}
    if "target_exam" not in prefs_cols:
        op.add_column(
            "user_preferences",
            sa.Column("target_exam", sa.String(length=20), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("user_preferences", "target_exam")
    op.drop_column("subtitles", "word_levels")

"""add word_ai_notes

Revision ID: i8h9c0d1e2f3
Revises: h8c9d0e1f2g3
Create Date: 2026-06-25 16:00:00.000000

Adds the pre-generated AI learning-notes table that turns the gloss endpoint
from real-time (20s) to instant (<10ms) for exam vocabulary:

  * ``context_source='global'``        — context-agnostic notes preheated by
                                          ``scripts/precompute_global_word_notes.py``,
                                          shared by every video and every user.
  * ``context_source='video:{uuid}'``  — context-specific notes produced by the
                                          ``prewarm_notes`` pipeline step once
                                          per video (uses a subtitle sentence as
                                          context).

Gloss prefers the per-video note, then ``global``, then falls back to a live
LLM call (which writes the ``global`` row so the next lookup is instant).
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "i8h9c0d1e2f3"
down_revision: str | None = "h8c9d0e1f2g3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "word_ai_notes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("word", sa.String(length=100), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("context_source", sa.String(length=40), nullable=False),
        sa.Column("contextual_note", sa.Text(), nullable=False, server_default=""),
        sa.Column("pitfalls", sa.Text(), nullable=False, server_default=""),
        sa.Column("knowledge", sa.Text(), nullable=False, server_default=""),
        sa.Column("model_version", sa.String(length=50), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("word", "level", "context_source", name="uq_word_ai_notes_triple"),
    )
    op.create_index("ix_word_ai_notes_word_level", "word_ai_notes", ["word", "level"])
    op.create_index("ix_word_ai_notes_word_source", "word_ai_notes", ["word", "context_source"])
    op.create_index("ix_word_ai_notes_source", "word_ai_notes", ["context_source"])


def downgrade() -> None:
    op.drop_index("ix_word_ai_notes_source", table_name="word_ai_notes")
    op.drop_index("ix_word_ai_notes_word_source", table_name="word_ai_notes")
    op.drop_index("ix_word_ai_notes_word_level", table_name="word_ai_notes")
    op.drop_table("word_ai_notes")

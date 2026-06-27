"""add exam_sentences + exam_sentence_words + exam_word_freq

Revision ID: h8c9d0e1f2g3
Revises: g7b8c9d0e1f2
Create Date: 2026-06-25 15:00:00.000000

Adds the 真题 (past-paper) corpus tables for the CET/高考/考研 feature's
真题 integration (example sentences, word index, word frequency).
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "h8c9d0e1f2g3"
down_revision: str | None = "g7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "exam_sentences",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("month", sa.Integer(), nullable=True),
        sa.Column("question_type", sa.String(length=30), nullable=True),
        sa.Column("sentence_en", sa.Text(), nullable=False),
        sa.Column("sentence_zh", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exam_sentences_level", "exam_sentences", ["level"])

    op.create_table(
        "exam_sentence_words",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sentence_id", sa.String(length=36), nullable=False),
        sa.Column("word", sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(["sentence_id"], ["exam_sentences.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sentence_id", "word", name="uq_exam_sentence_word"),
    )
    op.create_index("ix_exam_sentence_words_sentence_id", "exam_sentence_words", ["sentence_id"])
    op.create_index("ix_exam_sentence_words_word", "exam_sentence_words", ["word"])

    op.create_table(
        "exam_word_freq",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("word", sa.String(length=100), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("freq", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("word", "level", name="uq_exam_word_freq_word_level"),
    )
    op.create_index("ix_exam_word_freq_word", "exam_word_freq", ["word"])
    op.create_index("ix_exam_word_freq_level", "exam_word_freq", ["level"])


def downgrade() -> None:
    op.drop_index("ix_exam_word_freq_level", table_name="exam_word_freq")
    op.drop_index("ix_exam_word_freq_word", table_name="exam_word_freq")
    op.drop_table("exam_word_freq")

    op.drop_index("ix_exam_sentence_words_word", table_name="exam_sentence_words")
    op.drop_index("ix_exam_sentence_words_sentence_id", table_name="exam_sentence_words")
    op.drop_table("exam_sentence_words")

    op.drop_index("ix_exam_sentences_level", table_name="exam_sentences")
    op.drop_table("exam_sentences")

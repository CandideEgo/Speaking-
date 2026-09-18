"""Add vocab_sets + vocab_set_words (per-video exam-word quick-sieve sets).

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-09-19 00:00:00.000000

词汇本「筛选 + 快速过筛」学习闭环 (产品需求 §4.6):

- ``vocab_sets``: one row per (user, video, exam_level) — the word set the
  user collected from a video's subtitles for a target exam. ``exam_level``
  is nullable in the schema but the service always resolves it to a concrete
  level key (user preference, falling back to "cet4"), so the unique
  constraint effectively dedupes per level.
- ``vocab_set_words``: ordered membership rows joining the set to Vocabulary,
  carrying the quick-sieve tri-state (pending -> known/unknown -> learned).
  Positions are 1..N within a set and keep appending past the current max
  when a re-collect finds new tokens.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "h3i4j5k6l7m8"
down_revision: str | None = "g2h3i4j5k6l7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vocab_sets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("video_id", sa.String(36), sa.ForeignKey("videos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exam_level", sa.String(20), nullable=True),
        sa.Column(
            "last_activity_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "video_id", "exam_level", name="uq_vocab_sets_user_video_level"),
    )
    op.create_index("ix_vocab_sets_user_id", "vocab_sets", ["user_id"], unique=False)

    op.create_table(
        "vocab_set_words",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "set_id",
            sa.String(36),
            sa.ForeignKey("vocab_sets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "vocabulary_id",
            sa.String(36),
            sa.ForeignKey("vocabulary.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("sieved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("learned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_vocab_set_words_set_id_position",
        "vocab_set_words",
        ["set_id", "position"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_vocab_set_words_set_id_position", table_name="vocab_set_words")
    op.drop_table("vocab_set_words")
    op.drop_index("ix_vocab_sets_user_id", table_name="vocab_sets")
    op.drop_table("vocab_sets")

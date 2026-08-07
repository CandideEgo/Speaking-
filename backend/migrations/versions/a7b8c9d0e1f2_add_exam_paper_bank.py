"""add exam_papers and exam_questions bank tables

Revision ID: a7b8c9d0e1f2
Revises: v1w2x3y4z5a6
Create Date: 2026-08-06

Adds the static past-paper question bank:
  * exam_papers — one row per real paper set (level/year/month/set_no)
  * exam_questions — objective reading items (cloze / matching / reading)

Also links the existing attempt tables to the bank:
  * exam_sessions.paper_id -> exam_papers.id (nullable, legacy rows stay null)
  * exam_answers.question_id -> exam_questions.id (nullable)
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "v1w2x3y4z5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "exam_papers",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("set_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("source", sa.String(length=200), nullable=True),
        sa.Column("total_questions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("level", "year", "month", "set_no", name="uq_exam_paper_level_year_month_set"),
    )
    op.create_index("ix_exam_papers_level", "exam_papers", ["level"])

    op.create_table(
        "exam_questions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "paper_id",
            sa.String(length=36),
            sa.ForeignKey("exam_papers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("section", sa.String(length=30), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("passage", sa.Text(), nullable=True),
        sa.Column("question", sa.Text(), nullable=True),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("answer", sa.String(length=10), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("question_type", sa.String(length=20), nullable=False, server_default="reading"),
        sa.UniqueConstraint("paper_id", "number", name="uq_exam_question_paper_number"),
    )
    op.create_index("ix_exam_questions_paper_id", "exam_questions", ["paper_id"])

    # Link existing attempt tables to the bank (legacy rows keep NULL).
    op.add_column(
        "exam_sessions",
        sa.Column(
            "paper_id", sa.String(length=36), sa.ForeignKey("exam_papers.id", ondelete="SET NULL"), nullable=True
        ),
    )
    op.create_index("ix_exam_sessions_paper_id", "exam_sessions", ["paper_id"])

    op.add_column(
        "exam_answers",
        sa.Column(
            "question_id",
            sa.String(length=36),
            sa.ForeignKey("exam_questions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("exam_answers", "question_id")
    op.drop_index("ix_exam_sessions_paper_id", table_name="exam_sessions")
    op.drop_column("exam_sessions", "paper_id")
    op.drop_index("ix_exam_questions_paper_id", table_name="exam_questions")
    op.drop_table("exam_questions")
    op.drop_index("ix_exam_papers_level", table_name="exam_papers")
    op.drop_table("exam_papers")

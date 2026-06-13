"""add_speaking_rubric_and_detailed_scores

Revision ID: fa70252cc1d8
Revises: 3c4d5e6f7a8b
Create Date: 2026-06-02 23:26:19.400788
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = 'fa70252cc1d8'
down_revision: Union[str | None] = '3c4d5e6f7a8b'
branch_labels: Union[str | Sequence[str] | None] = None
depends_on: Union[str | Sequence[str] | None] = None


def _table_exists(name: str) -> bool:
    inspector = inspect(op.get_bind())
    return name in inspector.get_table_names()


def upgrade() -> None:
    if not _table_exists('speaking_rubrics'):
        op.create_table(
            'speaking_rubrics',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('is_default', sa.Boolean(), default=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        )

    if not _table_exists('rubric_criteria'):
        op.create_table(
            'rubric_criteria',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('rubric_id', sa.String(36), sa.ForeignKey('speaking_rubrics.id'), nullable=False),
            sa.Column('name', sa.String(50), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('weight', sa.Float(), default=1.0),
            sa.Column('sort_order', sa.Integer(), default=0),
        )

    if not _table_exists('speaking_attempt_scores'):
        op.create_table(
            'speaking_attempt_scores',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('speaking_attempt_id', sa.String(36), sa.ForeignKey('speaking_attempts.id'), nullable=False, index=True),
            sa.Column('criterion_id', sa.String(36), sa.ForeignKey('rubric_criteria.id'), nullable=False),
            sa.Column('score', sa.Float(), nullable=False),
            sa.Column('feedback', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        )

    # Seed default rubric — only if not already present
    conn = op.get_bind()
    existing = conn.execute(
        sa.text("SELECT id FROM speaking_rubrics WHERE id = 'default-rubric-001'")
    ).fetchone()
    if not existing:
        op.execute("""
            INSERT INTO speaking_rubrics (id, name, description, is_default, created_at)
            VALUES (
                'default-rubric-001',
                '口语评分标准',
                '评估发音、流利度、完整度、语调、语法准确性',
                true,
                NOW()
            )
        """)

        criteria = [
            ('criterion-pronunciation', 'default-rubric-001', '发音', '单词发音是否清晰、准确，包括重音和语调', 1.0, 0),
            ('criterion-fluency', 'default-rubric-001', '流利度', '说话节奏是否自然，停顿是否恰当', 1.0, 1),
            ('criterion-completeness', 'default-rubric-001', '完整度', '是否完整覆盖了参考答案的关键内容', 1.0, 2),
            ('criterion-intonation', 'default-rubric-001', '语调', '语调起伏是否自然，升降调是否恰当', 0.8, 3),
            ('criterion-grammar', 'default-rubric-001', '语法', '语法是否正确，时态和词序是否恰当', 0.8, 4),
        ]
        for cid, rid, name, desc, weight, sort_order in criteria:
            op.execute(f"""INSERT INTO rubric_criteria (id, rubric_id, name, description, weight, sort_order) VALUES ('{cid}', '{rid}', '{name}', '{desc}', {weight}, {sort_order})""")


def downgrade() -> None:
    op.drop_table('speaking_attempt_scores')
    op.drop_table('rubric_criteria')
    op.drop_table('speaking_rubrics')
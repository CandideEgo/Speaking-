"""add_speaking_rubric_and_detailed_scores

Revision ID: fa70252cc1d8
Revises: 3c4d5e6f7a8b
Create Date: 2026-06-02 23:26:19.400788
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'fa70252cc1d8'
down_revision: Union[str | None] = '3c4d5e6f7a8b'
branch_labels: Union[str | Sequence[str] | None] = None
depends_on: Union[str | Sequence[str] | None] = None


def upgrade() -> None:
    op.create_table(
        'speaking_rubrics',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_default', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        'rubric_criteria',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('rubric_id', sa.String(36), sa.ForeignKey('speaking_rubrics.id'), nullable=False),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('weight', sa.Float(), default=1.0),
        sa.Column('sort_order', sa.Integer(), default=0),
    )
    op.create_table(
        'speaking_attempt_scores',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('speaking_attempt_id', sa.String(36), sa.ForeignKey('speaking_attempts.id'), nullable=False, index=True),
        sa.Column('criterion_id', sa.String(36), sa.ForeignKey('rubric_criteria.id'), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('feedback', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    # Seed default rubric
    op.execute("""
        INSERT INTO speaking_rubrics (id, name, description, is_default, created_at)
        VALUES (
            'default-rubric-001',
            '演名动词经功駋算理',
            '平坄及复跟缺防死在可以，暂忆台，及公叶，项目-业期放在的板法表密经功駋在的结新秴乍',
            true,
            NOW()
        )
    """)

    criteria = [
        ('criterion-pronunciation', 'default-rubric-001', '变集在密加', '单词变集在复数学在，全际、起变集、非变集数学正确', 1.0, 0),
        ('criterion-fluency', 'default-rubric-001', '朰叶法表', '词驱数学这些藏物，数学这些未运头目标戴意螁', 1.0, 1),
        ('criterion-completeness', 'default-rubric-001', '公叶及名', '无木慨叶参考了的父字程市，木广览集了的南记', 1.0, 2),
        ('criterion-intonation', 'default-rubric-001', '项目-业', '项目这些藏物，数学这些等型词人演名项目体声', 0.8, 3),
        ('criterion-grammar', 'default-rubric-001', '识加', '单键经求数学这些正确，时长和词得数学正确', 0.8, 4),
    ]
    for cid, rid, name, desc, weight, sort_order in criteria:
        op.execute(f"""INSERT INTO rubric_criteria (id, rubric_id, name, description, weight, sort_order) VALUES ('{cid}', '{rid}', '{name}', '{desc}', {weight}, {sort_order})""")


def downgrade() -> None:
    op.drop_table('speaking_attempt_scores')
    op.drop_table('rubric_criteria')
    op.drop_table('speaking_rubrics')

"""add_invite_codes

Revision ID: 6d117491297b
Revises: 7db4e9d3fded
Create Date: 2026-05-30 14:50:49.969882
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers
revision: str = '6d117491297b'
down_revision: Union[str, None] = '7db4e9d3fded'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    inspector = inspect(op.get_bind())
    return name in inspector.get_table_names()


def upgrade() -> None:
    if not _table_exists('invite_codes'):
        op.create_table('invite_codes',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('code', sa.String(length=20), nullable=False),
        sa.Column('plan', sa.String(length=20), nullable=False),
        sa.Column('duration_days', sa.Integer(), nullable=False),
        sa.Column('batch_label', sa.String(length=100), nullable=True),
        sa.Column('is_used', sa.Boolean(), nullable=False),
        sa.Column('used_by', sa.String(length=36), nullable=True),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_invite_codes_code'), 'invite_codes', ['code'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_invite_codes_code'), table_name='invite_codes')
    op.drop_table('invite_codes')

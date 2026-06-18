"""add_password_reset_tokens_table

Revision ID: b2c3d4e5f6a7
Revises: 35e94e7744bc
Create Date: 2026-06-16 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    inspector = inspect(op.get_bind())
    return name in inspector.get_table_names()


def upgrade() -> None:
    if not _table_exists('password_reset_tokens'):
        op.create_table(
            'password_reset_tokens',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('token_hash', sa.String(255), nullable=False),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index(
            op.f('ix_password_reset_tokens_user_id'),
            'password_reset_tokens',
            ['user_id'],
        )


def downgrade() -> None:
    op.drop_index(op.f('ix_password_reset_tokens_user_id'), table_name='password_reset_tokens')
    op.drop_table('password_reset_tokens')

"""add_notifications_table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-16 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(name: str) -> bool:
    inspector = inspect(op.get_bind())
    return name in inspector.get_table_names()


def upgrade() -> None:
    if not _table_exists('notifications'):
        op.create_table(
            'notifications',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('type', sa.String(30), nullable=False),
            sa.Column('title', sa.String(200), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('related_url', sa.String(500), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index(
            op.f('ix_notifications_user_id'),
            'notifications',
            ['user_id'],
        )


def downgrade() -> None:
    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_table('notifications')

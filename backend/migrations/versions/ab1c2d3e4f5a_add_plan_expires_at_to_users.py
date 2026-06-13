"""add plan_expires_at to users

Revision ID: ab1c2d3e4f5a
Revises: fa70252cc1d8
Create Date: 2026-06-06

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'ab1c2d3e4f5a'
down_revision: Union[str, None] = 'fa70252cc1d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    inspector = inspect(op.get_bind())
    cols = [c['name'] for c in inspector.get_columns(table)]
    return column in cols


def upgrade() -> None:
    if not _column_exists('users', 'plan_expires_at'):
        op.add_column('users', sa.Column('plan_expires_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'plan_expires_at')

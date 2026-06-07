"""add plan_expires_at to users

Revision ID: ab1c2d3e4f5a
Revises: fa70252cc1d8
Create Date: 2026-06-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ab1c2d3e4f5a'
down_revision: Union[str, None] = 'fa70252cc1d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('plan_expires_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'plan_expires_at')

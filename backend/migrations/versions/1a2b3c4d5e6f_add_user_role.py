"""add user role

Revision ID: 1a2b3c4d5e6f
Revises: 9b2c3d4e5f6a
Create Date: 2026-06-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1a2b3c4d5e6f'
down_revision: Union[str, None] = '9b2c3d4e5f6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE roletype AS ENUM ('user', 'admin')")
    op.add_column(
        'users',
        sa.Column(
            'role',
            sa.Enum('user', 'admin', name='roletype'),
            nullable=False,
            server_default='user',
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'role')
    op.execute("DROP TYPE roletype")

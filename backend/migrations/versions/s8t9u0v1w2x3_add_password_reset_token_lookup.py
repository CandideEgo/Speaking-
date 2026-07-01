"""add token_lookup column to password_reset_tokens

Revision ID: s8t9u0v1w2x3
Revises: r7s8t9u0v1w2
Create Date: 2026-07-01 18:40:00.000000

Adds an indexed ``token_lookup`` column (SHA-256 hex of the raw reset token)
to password_reset_tokens. This lets the /reset-password endpoint find the
candidate token row in O(1) via an indexed equality lookup, instead of
loading every unexpired token and bcrypt-verifying each — an O(n) slow path
that was both a DoS vector and a timing-leak (attacker could infer how many
valid tokens exist from response latency).

The raw token is still never stored; token_hash (bcrypt) remains the
authoritative verification. token_lookup is only a fast locator.

Existing token rows get NULL token_lookup and are still honored via a legacy
full-scan fallback path until they expire (default 30 min). New tokens always
populate token_lookup.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "s8t9u0v1w2x3"
down_revision: str | None = "r7s8t9u0v1w2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "password_reset_tokens",
        sa.Column("token_lookup", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_password_reset_tokens_token_lookup",
        "password_reset_tokens",
        ["token_lookup"],
    )


def downgrade() -> None:
    op.drop_index("ix_password_reset_tokens_token_lookup", table_name="password_reset_tokens")
    op.drop_column("password_reset_tokens", "token_lookup")

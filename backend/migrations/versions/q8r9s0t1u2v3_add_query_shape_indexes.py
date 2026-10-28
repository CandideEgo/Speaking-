"""Add the missing query-shape indexes (BE-30).

The weekly rankings and the public feed filter on columns that no existing
index covers:

* ``user_favorites.created_at`` — weekly favorites ranking / browse sort
* ``behavior_events(server_ts, event_type)`` — weekly play ranking
* ``videos(is_official, is_published, status)`` — public feed/rankings

Conditional like ``p7q8r9s0t1u2`` so a database that already has one of the
indexes (e.g. hand-created during an incident) still upgrades cleanly.

Revision ID: q8r9s0t1u2v3
Revises: p7q8r9s0t1u2
"""

import sqlalchemy as sa
from alembic import op

revision = "q8r9s0t1u2v3"
down_revision = "p7q8r9s0t1u2"
branch_labels = None
depends_on = None

_INDEXES = (
    ("ix_user_favorites_created_at", "user_favorites", ["created_at"]),
    ("ix_behavior_events_server_ts_type", "behavior_events", ["server_ts", "event_type"]),
    ("ix_videos_public", "videos", ["is_official", "is_published", "status"]),
)


def _index_names(table: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {index["name"] for index in inspector.get_indexes(table) if index.get("name")}


def upgrade() -> None:
    for name, table, columns in _INDEXES:
        if name not in _index_names(table):
            op.create_index(name, table, columns)


def downgrade() -> None:
    for name, table, _columns in reversed(_INDEXES):
        if name in _index_names(table):
            op.drop_index(name, table_name=table)

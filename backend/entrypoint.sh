#!/bin/sh
# Container entrypoint: runs Alembic migrations before starting the app server.
#
# Migrations are idempotent (alembic upgrade head is a no-op when already at
# head), so this is safe across container restarts. We log the migration result
# but never block startup on a migration failure — a failed migration usually
# means the DB is unreachable, which gunicorn will surface anyway via /health.
#
# Usage (docker-compose):
#   command: ["/app/entrypoint.sh", "gunicorn", "app.main:app", "-w", "2", ...]
#   # or, to just run migrations without starting the app:
#   command: ["/app/entrypoint.sh", "migrate-only"]

set -e

MIGRATE_ONLY=0
if [ "$1" = "migrate-only" ]; then
  MIGRATE_ONLY=1
  shift
fi

echo "[entrypoint] Running database migrations..."
if alembic upgrade head; then
  echo "[entrypoint] Migrations OK."
else
  echo "[entrypoint] WARNING: migration step failed — continuing startup so /health can report the DB issue." >&2
fi

if [ "$MIGRATE_ONLY" = "1" ]; then
  echo "[entrypoint] migrate-only mode, exiting."
  exit 0
fi

if [ $# -eq 0 ]; then
  echo "[entrypoint] No command given, exiting." >&2
  exit 1
fi

echo "[entrypoint] Starting: $*"
exec "$@"

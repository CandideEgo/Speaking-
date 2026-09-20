#!/bin/sh
# Container entrypoint: optionally runs Alembic migrations before starting the
# app server.
#
# Migrations are idempotent (alembic upgrade head is a no-op when already at
# head), so this is safe across container restarts. We log the migration result
# but never block startup on a migration failure — a failed migration usually
# means the DB is unreachable, which gunicorn will surface anyway via /health.
#
# Migration ownership: exactly ONE container may apply migrations. This image
# backs three compose services, so the gate below splits them:
#   backend       RUN_MIGRATIONS unset (=> 1) — owns migrations
#   celery        RUN_MIGRATIONS=0            — waits for backend to be healthy
#   celery-beat   RUN_MIGRATIONS=0            — waits for backend to be healthy
# All three running `alembic upgrade head` at once races on the same revision;
# observed as a real unique-constraint violation (`duplicate key` on a backfill
# INSERT) in the celery container, where the losing containers could only fall
# back to the "continuing startup" branch below and leave the schema half
# migrated.
#
# Usage (docker-compose):
#   command: ["/app/entrypoint.sh", "gunicorn", "app.main:app", "-w", "2", ...]
#   # or, to just run migrations without starting the app:
#   command: ["/app/entrypoint.sh", "migrate-only"]

set -e

# Ensure the app directory is on sys.path for alembic (which runs from /app
# but may not have /app itself on the path depending on how pip installed things).
export PYTHONPATH="/app:${PYTHONPATH:-}"

MIGRATE_ONLY=0
if [ "$1" = "migrate-only" ]; then
  MIGRATE_ONLY=1
  shift
  # An explicit migrate-only invocation means the operator wants migrations
  # run right now, so it overrides the ownership gate.
  RUN_MIGRATIONS=1
fi

RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"

if [ "$RUN_MIGRATIONS" = "0" ]; then
  echo "[entrypoint] RUN_MIGRATIONS=0 — skipping migrations (another service owns them)."
else
  echo "[entrypoint] Running database migrations..."
  if alembic upgrade head; then
    echo "[entrypoint] Migrations OK."
  else
    echo "[entrypoint] WARNING: migration step failed — continuing startup so /health can report the DB issue." >&2
  fi
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

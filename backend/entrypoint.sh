#!/bin/sh
# Container entrypoint: optionally runs Alembic migrations before starting the
# app server.
#
# Migrations are idempotent (alembic upgrade head is a no-op when already at
# head), so this is safe across container restarts.
#
# Failure handling differs by mode, and the difference is the point:
#   migrate-only  — it IS the release gate (the deploy skill runs it before
#                   switching containers). A failure exits non-zero so the
#                   deploy stops instead of switching over a half-migrated
#                   schema. Reporting exit 0 here used to make a failed
#                   migration look like a successful release step.
#   normal start  — the container keeps starting so /health can report the DB
#                   problem instead of the container vanishing into a restart
#                   loop. This is a deliberate trade, not a silent success: the
#                   failure is logged as an error with its exit status.
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
  alembic upgrade head && migration_status=0 || migration_status=$?
  if [ "$migration_status" -eq 0 ]; then
    echo "[entrypoint] Migrations OK."
  else
    echo "[entrypoint] ERROR: alembic upgrade head failed (exit $migration_status)." >&2
    if [ "$MIGRATE_ONLY" = "1" ]; then
      # Never turn this into a success: the caller decides whether to switch
      # containers based on this exit status.
      echo "[entrypoint] migrate-only mode: propagating the migration failure." >&2
      exit "$migration_status"
    fi
    echo "[entrypoint] WARNING: continuing startup so /health can report the DB issue." >&2
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

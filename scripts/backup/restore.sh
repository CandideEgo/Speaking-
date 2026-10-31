#!/usr/bin/env bash
# SeeWord verified restore (A09 / OPS-06).
#
# Restores a backup produced by backup.sh into a target database, then verifies
# the things a restore actually owes: the alembic revision matches the archive,
# the row counts match the manifest, and the media archive is intact. Nothing is
# reported as restored until those checks pass.
#
# Usage:
#   restore.sh --from <run-dir|archive.tar.gz[.gpg]> [options]
#
# Options:
#   --target-db NAME         database to restore into        (seeword_restore)
#   --target-container NAME  container running Postgres      ($DB_CONTAINER or compose)
#   --recreate               drop + create the target DB first (drops its data)
#   --force                  allow restoring over a non-empty DB without --recreate
#   --verify-only            verify the archive, touch no database
#   --media-target PATH|VOL  also restore media into this directory or volume
#
# Environment: DOCKER, SEEWORD_DIR, COMPOSE_FILE, DB_SERVICE, DB_USER.
# Prints elapsed seconds so an RTO drill can record a real number.
set -euo pipefail

DOCKER=${DOCKER:-docker}
SEEWORD_DIR=${SEEWORD_DIR:-/opt/speaking}
COMPOSE_FILE=${COMPOSE_FILE:-$SEEWORD_DIR/docker-compose.prod.yml}
DB_SERVICE=${DB_SERVICE:-db}
DB_USER=${DB_USER:-seeword}
DB_CONTAINER=${DB_CONTAINER:-}

FROM=""
TARGET_DB=${TARGET_DB:-seeword_restore}
RECREATE=0
FORCE=0
VERIFY_ONLY=0
MEDIA_TARGET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM=${2:-}; shift 2 ;;
    --target-db) TARGET_DB=${2:-}; shift 2 ;;
    --target-container) DB_CONTAINER=${2:-}; shift 2 ;;
    --recreate) RECREATE=1; shift ;;
    --force) FORCE=1; shift ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    --media-target) MEDIA_TARGET=${2:-}; shift 2 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ -n "$FROM" ] || { echo "--from is required" >&2; exit 2; }

START=$(date +%s)
TMPDIR_=""
cleanup() {
  # The EXIT trap's last command must succeed: `[ -n "" ] && ...` returns 1 and
  # would otherwise become the script's exit status (a green restore read as failure).
  if [ -n "$TMPDIR_" ]; then rm -rf "$TMPDIR_"; fi
  return 0
}
trap cleanup EXIT

die() { echo "RESTORE FAILED: $*" >&2; exit 1; }
log() { printf '[restore] %s\n' "$*"; }

# --- 1. Resolve the archive -------------------------------------------------
if [ -d "$FROM" ]; then
  RUN_DIR=$FROM
elif [ -f "$FROM" ]; then
  TMPDIR_=$(mktemp -d)
  case "$FROM" in
    *.gpg)
      gpg --batch --yes --decrypt "$FROM" >"$TMPDIR_/archive.tar.gz" || die "gpg decrypt failed"
      tar xzf "$TMPDIR_/archive.tar.gz" -C "$TMPDIR_" || die "tarball extraction failed"
      ;;
    *.tar.gz) tar xzf "$FROM" -C "$TMPDIR_" || die "tarball extraction failed" ;;
    *) die "unsupported archive type: $FROM" ;;
  esac
  RUN_DIR=$(find "$TMPDIR_" -mindepth 1 -maxdepth 1 -type d | head -n1)
  [ -n "$RUN_DIR" ] || die "archive contains no run directory"
else
  die "source not found: $FROM"
fi

[ -f "$RUN_DIR/manifest.json" ] || die "manifest.json missing in $RUN_DIR"
[ -f "$RUN_DIR/db.dump" ] || die "db.dump missing in $RUN_DIR"
if [ -d "$FROM" ] && [ ! -f "$RUN_DIR/SUCCESS" ]; then
  die "backup run has no SUCCESS marker (it failed or was interrupted)"
fi

# --- 2. Verify archive integrity -------------------------------------------
log "verifying checksums"
( cd "$RUN_DIR" && sha256sum -c SHA256SUMS --quiet ) || die "SHA256SUMS mismatch"

db_exec() {
  if [ -n "$DB_CONTAINER" ]; then
    "$DOCKER" exec -i "$DB_CONTAINER" "$@"
  else
    "$DOCKER" compose -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" "$@"
  fi
}

db_exec pg_restore --list <"$RUN_DIR/db.dump" >/dev/null || die "db.dump has an unreadable table of contents"
log "dump OK: $(grep -c . "$RUN_DIR/db.toc" 2>/dev/null || echo '?') TOC lines"

REVISION=$(tr -d '[:space:]' <"$RUN_DIR/alembic_version.txt" 2>/dev/null || echo unknown)
log "archive alembic revision: $REVISION"

if [ "$VERIFY_ONLY" = "1" ]; then
  log "verify-only: database untouched"
  echo "elapsed_seconds=$(( $(date +%s) - START ))"
  exit 0
fi

# --- 3. Target database ----------------------------------------------------
db_query() { db_exec psql -U "$DB_USER" -d "${1:-$TARGET_DB}" -tAc "$2"; }

if [ "$RECREATE" = "1" ]; then
  log "dropping and recreating $TARGET_DB"
  db_exec psql -U "$DB_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TARGET_DB'" >/dev/null 2>&1 || true
  db_exec psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$TARGET_DB\"" >/dev/null || die "could not drop $TARGET_DB"
  db_exec psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$TARGET_DB\"" >/dev/null || die "could not create $TARGET_DB"
elif ! db_query postgres "SELECT 1 FROM pg_database WHERE datname='$TARGET_DB'" | grep -q 1; then
  log "creating $TARGET_DB"
  db_exec psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$TARGET_DB\"" >/dev/null || die "could not create $TARGET_DB"
else
  TABLES_IN_TARGET=$(db_query "$TARGET_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" | tr -d '[:space:]')
  if [ "${TABLES_IN_TARGET:-0}" != "0" ] && [ "$FORCE" != "1" ]; then
    die "target $TARGET_DB already has $TABLES_IN_TARGET tables; pass --recreate or --force"
  fi
fi

# --- 4. Restore ------------------------------------------------------------
log "restoring into $TARGET_DB"
RESTORE_START=$(date +%s)
db_exec pg_restore -U "$DB_USER" -d "$TARGET_DB" --no-owner --exit-on-error <"$RUN_DIR/db.dump" ||
  die "pg_restore failed"
log "pg_restore finished in $(( $(date +%s) - RESTORE_START ))s"

# --- 5. Verify against the manifest ---------------------------------------
RESTORED_REVISION=$(db_query "$TARGET_DB" "SELECT version_num FROM alembic_version" | tr -d '[:space:]')
[ "$RESTORED_REVISION" = "$REVISION" ] || die "alembic revision mismatch: restored=$RESTORED_REVISION archive=$REVISION"

mismatch=0
while IFS='=' read -r table expected; do
  [ -n "$table" ] || continue
  [ "$expected" = "missing" ] && continue
  actual=$(db_query "$TARGET_DB" "SELECT count(*) FROM $table" | tr -d '[:space:]') || { echo "  MISSING $table" >&2; mismatch=1; continue; }
  if [ "$actual" != "$expected" ]; then
    echo "  MISMATCH $table restored=$actual expected=$expected" >&2
    mismatch=1
  fi
done <"$RUN_DIR/row_counts.txt"
[ "$mismatch" = "0" ] || die "row counts differ from the manifest"
log "row counts match the manifest; revision matches"

# --- 6. Media (optional) ---------------------------------------------------
if [ -n "$MEDIA_TARGET" ] && [ -f "$RUN_DIR/media.tar.gz" ]; then
  case "$MEDIA_TARGET" in
    /*) log "restoring media into directory $MEDIA_TARGET"; mkdir -p "$MEDIA_TARGET"
        tar xzf "$RUN_DIR/media.tar.gz" -C "$MEDIA_TARGET" || die "media extraction failed" ;;
    *)  log "restoring media into volume $MEDIA_TARGET"
        "$DOCKER" run --rm -v "$MEDIA_TARGET:/media" -v "$RUN_DIR:/backup:ro" postgres:16-alpine \
          sh -c 'cd /media && tar xzf /backup/media.tar.gz' || die "media volume restore failed" ;;
  esac
  restored_files=$(tar -tzf "$RUN_DIR/media.tar.gz" | grep -cv '/$' || true)
  EXPECTED=$(sed -n 's/.*"media_files": \([0-9]*\).*/\1/p' "$RUN_DIR/manifest.json")
  if [ -n "$EXPECTED" ] && [ "$restored_files" != "$EXPECTED" ]; then
    log "WARNING: media file count restored=$restored_files manifest=$EXPECTED"
  else
    log "media files restored: $restored_files"
  fi
fi

echo "elapsed_seconds=$(( $(date +%s) - START ))"
log "RESTORE OK: $TARGET_DB @ $RESTORED_REVISION"

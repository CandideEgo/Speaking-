#!/usr/bin/env bash
# A09 / OPS-06 backup+restore drill, run inside WSL (needs the Docker CLI).
#
# Assumes the isolated Postgres container `seeword-a09-pg` is up with the schema
# migrated and representative rows seeded (docs/evidence/iteration-3/seed_a09.py).
# Produces logs + a summary under $OUT; grades each step rather than stopping.
set -uo pipefail

REPO=${REPO:-/mnt/c/Users/Fuwei/speaking}
PG=${PG:-seeword-a09-pg}
PORT=${PORT:-15433}
MEDIA=/tmp/a09-media
BK=/tmp/a09-backups
OUT=${OUT:-/tmp/a09-drill}
RESTORED_MEDIA=/tmp/a09-restored-media
DEPLOY_DIR=/tmp/a09-seeword

mkdir -p "$OUT"
: >"$OUT/summary.txt"
pass() { echo "PASS $*" | tee -a "$OUT/summary.txt"; }
fail() { echo "FAIL $*" | tee -a "$OUT/summary.txt"; }
step() { echo "== $*" | tee -a "$OUT/summary.txt"; }

step "prepare media, deployment dir + clean previous artifacts"
rm -rf "$MEDIA" "$BK" "$RESTORED_MEDIA" "$DEPLOY_DIR"
mkdir -p "$MEDIA/nested" "$DEPLOY_DIR"
head -c 2048 /dev/urandom >"$MEDIA/clip-a.mp4"
head -c 1024 /dev/urandom >"$MEDIA/nested/clip-b.mp4"
echo '{"note":"seed"}' >"$MEDIA/meta.json"
printf 'ENV=production\n# drill .env (no real secrets)\n' >"$DEPLOY_DIR/.env"
cp "$REPO/docker-compose.prod.yml" "$DEPLOY_DIR/docker-compose.prod.yml"
export SEEWORD_DIR="$DEPLOY_DIR" COMPOSE_FILE="$DEPLOY_DIR/docker-compose.prod.yml"

step "source row counts"
docker exec "$PG" psql -U seeword -d seeword -tAc \
  "SELECT 'users='||count(*) FROM users UNION ALL SELECT 'videos='||count(*) FROM videos UNION ALL SELECT 'subtitles='||count(*) FROM subtitles" \
  | tee "$OUT/source_counts.txt"

step "backup run"
BACKUP_ROOT="$BK" BACKUP_TARBALL=1 DB_CONTAINER="$PG" \
  BACKUP_MEDIA=1 MEDIA_PATH="$MEDIA" \
  bash "$REPO/scripts/backup/backup.sh" 2>&1 | tee "$OUT/backup.txt"
backup_status=${PIPESTATUS[0]}
RUN_DIR=$(find "$BK" -mindepth 1 -maxdepth 1 -type d | head -n1)

if [ "$backup_status" = 0 ] && [ -n "$RUN_DIR" ] && [ -f "$RUN_DIR/SUCCESS" ]; then
  pass "backup produced SUCCESS marker"
else
  fail "backup did not produce SUCCESS (exit=$backup_status)"
fi
cat "$RUN_DIR/manifest.json" 2>/dev/null | tee "$OUT/manifest.json"
cat "$RUN_DIR/row_counts.txt" 2>/dev/null | tee "$OUT/row_counts.txt"
sha256sum "$RUN_DIR"/db.dump 2>/dev/null | tee -a "$OUT/summary.txt"

step "failure mode: unreachable database must NOT report success"
rm -rf /tmp/a09-backups-fail
BACKUP_ROOT=/tmp/a09-backups-fail BACKUP_TARBALL=0 DB_CONTAINER=seeword-no-such-db \
  BACKUP_MEDIA=0 bash "$REPO/scripts/backup/backup.sh" >"$OUT/backup_fail.txt" 2>&1
fail_status=$?
FAIL_DIR=$(find /tmp/a09-backups-fail -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -n1)
if [ "$fail_status" != 0 ] && [ -f "$FAIL_DIR/FAILED" ] && [ ! -f "$FAIL_DIR/SUCCESS" ]; then
  pass "failed dump exits non-zero and leaves FAILED, no SUCCESS"
else
  fail "failure mode not detected (exit=$fail_status dir=$FAIL_DIR)"
fi

step "verify-only mode"
DB_CONTAINER="$PG" bash "$REPO/scripts/backup/restore.sh" --from "$RUN_DIR" --verify-only 2>&1 | tee "$OUT/verify_only.txt"
[ "${PIPESTATUS[0]}" = 0 ] && pass "verify-only accepted the archive" || fail "verify-only rejected the archive"

step "restore into seeword_restore (fresh) + media"
DB_CONTAINER="$PG" bash "$REPO/scripts/backup/restore.sh" --from "$RUN_DIR" \
  --target-db seeword_restore --recreate --media-target "$RESTORED_MEDIA" 2>&1 | tee "$OUT/restore.txt"
restore_status=${PIPESTATUS[0]}
[ "$restore_status" = 0 ] && pass "restore reported OK" || fail "restore failed (exit=$restore_status)"

step "target row counts"
docker exec "$PG" psql -U seeword -d seeword_restore -tAc \
  "SELECT 'users='||count(*) FROM users UNION ALL SELECT 'videos='||count(*) FROM videos UNION ALL SELECT 'subtitles='||count(*) FROM subtitles" \
  | tee "$OUT/target_counts.txt"

step "target revision + media files + elapsed"
docker exec "$PG" psql -U seeword -d seeword_restore -tAc "SELECT version_num FROM alembic_version" | tee "$OUT/target_revision.txt"
find "$RESTORED_MEDIA" -type f | wc -l | tee "$OUT/restored_media_count.txt"
grep -o 'elapsed_seconds=[0-9]*' "$OUT/restore.txt" | tail -n1 | tee -a "$OUT/summary.txt"

step "done"
[ -f "$OUT/restore.txt" ] && grep -q "RESTORE OK" "$OUT/restore.txt" && pass "restore OK line present" || fail "restore OK line missing"

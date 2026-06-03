#!/bin/bash
# Start all services in background. Logs → ./logs/
#
# 容器名称: speaking-db-1 (PostgreSQL), speaking-redis-1 (Redis)

PROJECT_DIR="$HOME/Speaking"
cd "$PROJECT_DIR"
mkdir -p logs

echo "=== Speaking — starting all services ==="

# 1. Infra (DB + Redis)
echo "[infra] starting..."

if ! command -v docker &>/dev/null; then
  echo ""
  echo "ERROR: docker not found in this WSL distro."
  echo "Enable WSL integration in Docker Desktop:"
  echo "  Settings → Resources → WSL Integration → enable this distro"
  echo ""
  exit 1
fi

# Try starting existing containers first, fall back to compose up
if ! docker start speaking-db-1 speaking-redis-1 2>/dev/null; then
  if ! docker compose -f docker-compose.dev.yml up -d; then
    echo ""
    echo "ERROR: failed to start infra containers."
    echo "Is Docker Desktop running on Windows?"
    echo ""
    exit 1
  fi
fi

# 2. Database migrations
echo "[db] running migrations..."
cd "$PROJECT_DIR/backend"
source .venv/bin/activate
PYTHONPATH="$PROJECT_DIR/backend" alembic upgrade head
cd "$PROJECT_DIR"

# 3. Backend
echo "[backend] starting on :8000..."
nohup bash -c "cd $PROJECT_DIR/backend && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload" \
  > logs/backend.log 2>&1 &
echo "  pid=$!"

# 4. Celery
echo "[celery] starting worker..."
nohup bash -c "cd $PROJECT_DIR/backend && source .venv/bin/activate && celery -A app.tasks.celery_app worker --loglevel=info" \
  > logs/celery.log 2>&1 &
echo "  pid=$!"

# 5. Frontend
# Clean stale .next cache to avoid "Cannot find module './xxx.js'" errors
echo "[frontend] cleaning .next cache..."
rm -rf "$PROJECT_DIR/frontend/.next"

echo "[frontend] starting on :3000..."
nohup bash -c "cd $PROJECT_DIR/frontend && npm run dev" \
  > logs/frontend.log 2>&1 &
echo "  pid=$!"

echo ""
echo "=== All services started ==="
echo "  Backend  → http://localhost:8000/docs"
echo "  Frontend → http://localhost:3000"
echo "  Logs     → ~/Speaking/logs/"
echo ""
echo "Containers: docker ps --filter name=speaking"

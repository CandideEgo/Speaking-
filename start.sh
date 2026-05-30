#!/bin/bash
# Start all services in background. Logs → ./logs/

PROJECT_DIR="$HOME/Speaking"
cd "$PROJECT_DIR"
mkdir -p logs

echo "=== Speaking — starting all services ==="

# 1. Infra (DB + Redis)
echo "[infra] starting..."
docker compose -f docker-compose.dev.yml up -d

# 2. Backend
echo "[backend] starting on :8000..."
bash -c 'cd ~/Speaking/backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload' \
  > logs/backend.log 2>&1 &
echo "  pid=$!"

# 3. Celery
echo "[celery] starting worker..."
bash -c 'cd ~/Speaking/backend && source venv/bin/activate && celery -A app.tasks.celery_app worker --loglevel=info' \
  > logs/celery.log 2>&1 &
echo "  pid=$!"

# 4. Frontend
echo "[frontend] starting on :3000..."
bash -c 'cd ~/Speaking/frontend && npm run dev' \
  > logs/frontend.log 2>&1 &
echo "  pid=$!"

echo ""
echo "=== All services started ==="
echo "  Backend  → http://localhost:8000/docs"
echo "  Frontend → http://localhost:3000"
echo "  Logs     → ~/Speaking/logs/"

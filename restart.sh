#!/bin/bash
# Restart all Speaking services (stop + clean + start)

PROJECT_DIR="$HOME/Speaking"
cd "$PROJECT_DIR"

echo "=== Speaking — restarting ==="

# 1. Stop everything
echo "[stop] killing existing processes..."
pkill -f "uvicorn app.main:app" 2>/dev/null && echo "  backend stopped"
pkill -f "celery -A app.tasks.celery_app" 2>/dev/null && echo "  celery stopped"
pkill -f "next dev" 2>/dev/null && echo "  frontend stopped"

# Wait for ports to free
sleep 2

# 2. Clean caches
echo "[clean] removing .next cache..."
rm -rf "$PROJECT_DIR/frontend/.next"

# 3. Start everything via start.sh
exec "$PROJECT_DIR/start.sh" "$@"

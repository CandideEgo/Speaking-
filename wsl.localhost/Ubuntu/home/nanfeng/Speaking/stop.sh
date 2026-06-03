#!/bin/bash
# Stop all Speaking services

echo "=== Speaking — stopping ==="

# Kill uvicorn, celery, next dev
pkill -f "uvicorn app.main:app" 2>/dev/null && echo "[backend] stopped"
pkill -f "celery -A app.tasks.celery_app" 2>/dev/null && echo "[celery] stopped"
pkill -f "next dev" 2>/dev/null && echo "[frontend] stopped"

# Optionally stop infra
if [ "$1" = "--infra" ]; then
  cd "$(dirname "$0")"
  docker compose -f docker-compose.dev.yml down
  echo "[infra] stopped"
fi

echo "=== Done ==="

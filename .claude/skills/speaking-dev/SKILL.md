# Speaking Dev — Service Lifecycle

Manage the Speaking app services (start, stop, restart) on Windows.

## Trigger
- `/dev` or `/speaking-dev` — start all services
- `/dev-stop` — stop all services
- `/dev-restart` — restart all services (stop + clean cache + start)

## Context
This is a full-stack English speaking practice app with 3 runtime services:
- **Backend**: FastAPI via uvicorn on :8000
- **Celery**: Background task worker (pool=solo for Windows)
- **Frontend**: Next.js dev server on :3000
- **Infra**: PostgreSQL + Redis via Docker containers (speaking-db-1, speaking-redis-1)

## Instructions

### Start (`/dev` or `/speaking-dev`)

1. **Kill zombie processes** — ALWAYS do this first to avoid port conflicts:
   ```bash
   for port in 8000 3000 3001; do
     pids=$(netstat -ano | grep ":$port " | grep LISTENING | awk '{print $5}' | sort -u)
     for pid in $pids; do taskkill //PID $pid //F 2>/dev/null; done
   done
   sleep 2
   ```
   Verify ports are free: `netstat -ano | grep -E ':(8000|3000) ' | grep LISTENING` should return empty.

2. **Check prerequisites** — verify Docker Desktop is running:
   ```bash
   docker info > /dev/null 2>&1 && echo "Docker OK" || echo "Docker not running"
   ```

3. **Start infra** (DB + Redis):
   ```bash
   docker start speaking-db-1 speaking-redis-1 2>/dev/null || docker compose -f docker-compose.dev.yml up -d
   ```

4. **Run database migrations** (idempotent):
   ```bash
   cd C:/Users/Administrator/Speaking/backend && .venv/Scripts/python.exe -m alembic upgrade head
   ```

5. **Start backend** (uvicorn on :8000):
   ```bash
   cd C:/Users/Administrator/Speaking/backend && .venv/Scripts/python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   Run in background with `run_in_background: true`.

6. **Start Celery** worker (pool=solo for Windows):
   ```bash
   cd C:/Users/Administrator/Speaking/backend && .venv/Scripts/python.exe -m celery -A app.tasks.celery_app worker --pool=solo --loglevel=info
   ```
   Run in background with `run_in_background: true`.

7. **Start frontend** — clear .next cache first, then dev server:
   ```bash
   rm -rf C:/Users/Administrator/Speaking/frontend/.next
   cd C:/Users/Administrator/Speaking/frontend && npm run dev
   ```
   Run in background with `run_in_background: true`.

8. **Verify** — wait 8 seconds, then check:
   ```bash
   curl -s http://localhost:8000/health | head -1
   curl -s http://localhost:3000 | head -1
   ```
   If backend returns `{"status":"ok"}` and frontend returns HTML, all good.

9. **Report status**:
   ```
   === Speaking — all services started ===
     Backend  → http://localhost:8000/docs
     Frontend → http://localhost:3000
     Celery   → background worker (pool=solo)
   ```

### Stop (`/dev-stop`)

1. **Kill all services by port** (catches everything including zombie processes):
   ```bash
   for port in 8000 3000 3001; do
     pids=$(netstat -ano | grep ":$port " | grep LISTENING | awk '{print $5}' | sort -u)
     for pid in $pids; do taskkill //PID $pid //F 2>/dev/null; done
   done
   ```

2. If `--infra` flag provided by user, also stop Docker containers:
   ```bash
   docker compose -f docker-compose.dev.yml down
   ```

### Restart (`/dev-restart`)

1. Run stop procedure
2. Wait 2 seconds for ports to free
3. Clear .next cache: `rm -rf C:/Users/Administrator/Speaking/frontend/.next`
4. Run start procedure (step 1 kills zombies automatically)

## Notes
- **Always kill ports first** — step 1 of Start is mandatory, not optional. It prevents the #1 source of bugs (zombie processes on 8000/3000).
- All services run natively on Windows (not in Docker containers)
- Only infra (PostgreSQL + Redis) runs in Docker
- Use `--pool=solo` for Celery on Windows (prefork not supported)
- The venv Python is at `backend/.venv/Scripts/python.exe`
- If frontend starts on 3001 instead of 3000, it means port 3000 is still occupied — re-run the kill step

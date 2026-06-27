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

1. **Detect & kill existing processes** — ALWAYS do this first, before starting anything. Detects what's listening on the app ports, kills it, and verifies the ports are actually free (with a fallback for orphaned `--reload` reloaders — see Notes):

   ```bash
   # 1a. Detect — show what's currently listening on the app ports
   echo "=== pre-start: listening processes ==="
   netstat -ano | grep -E ':(8000|3000|3001) ' | grep LISTENING || echo "(none)"

   # 1b. Kill by PID for each port (PID is column 5 of `netstat -ano`)
   for port in 8000 3000 3001; do
     pids=$(netstat -ano | grep ":$port " | grep LISTENING | awk '{print $5}' | sort -u)
     for pid in $pids; do
       [ -n "$pid" ] && taskkill //PID $pid //F 2>/dev/null && echo "killed PID $pid on :$port"
     done
   done
   sleep 2

   # 1c. Verify ports are free
   if netstat -ano | grep -E ':(8000|3000|3001) ' | grep -q LISTENING; then
     # Fallback: orphaned --reload reloader parents can keep a port LISTENING
     # under a stale PID that taskkill already "killed" (cross-session orphan /
     # lingering reloader parent). Killing all python.exe clears it. Safe to run
     # at start because no services are supposed to be up yet.
     echo "ports still occupied after PID kill — clearing all python.exe"
     taskkill //F //IM python.exe 2>/dev/null
     sleep 2
   fi
   netstat -ano | grep -E ':(8000|3000|3001) ' | grep LISTENING || echo "all app ports free"
   ```
   The final line MUST print `all app ports free`. If it does not, do NOT proceed to start — re-run the kill step or the python.exe fallback. Starting on an occupied port is the #1 source of bugs (zombie on 8000/3000, silent stale-reloader serving old code, frontend falling back to 3001).

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
   cd C:/Users/Administrator/Speaking/backend && .venv/Scripts/python.exe -m celery -A app.tasks.celery_app worker --pool=solo -Q celery,transcription_gpu --loglevel=info
   ```
   Run in background with `run_in_background: true`.

   The worker consumes **both** queues. Video transcription (`transcribe_video_gpu`) is routed to the dedicated `transcription_gpu` queue so it can run on a separate remote GPU worker in production; locally there is only one machine, so this worker drains both queues (head/tail/localize/orders/watchdog on `celery`, transcription on `transcription_gpu`). Without `-Q transcription_gpu`, transcription tasks would sit in the queue forever.

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
   If backend returns `{"status":"ok"}` and frontend returns HTML, all good. Also confirm the Celery worker registered both queues (`celery` + `transcription_gpu`) and the 5 video tasks in its startup log.

9. **Report status**:
   ```
   === Speaking — all services started ===
     Backend  → http://localhost:8000/docs
     Frontend → http://localhost:3000
     Celery   → pool=solo, queues: celery + transcription_gpu
   ```

### Stop (`/dev-stop`)

1. **Detect & kill all services by port** (same robust detect→kill→verify as Start step 1; catches everything including zombie processes and orphaned reloaders):
   ```bash
   for port in 8000 3000 3001; do
     pids=$(netstat -ano | grep ":$port " | grep LISTENING | awk '{print $5}' | sort -u)
     for pid in $pids; do
       [ -n "$pid" ] && taskkill //PID $pid //F 2>/dev/null && echo "killed PID $pid on :$port"
     done
   done
   sleep 2
   if netstat -ano | grep -E ':(8000|3000|3001) ' | grep -q LISTENING; then
     taskkill //F //IM python.exe 2>/dev/null; sleep 2
   fi
   netstat -ano | grep -E ':(8000|3000|3001) ' | grep LISTENING || echo "all app ports free"
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
- **Always detect & kill ports first** — step 1 of Start/Stop is mandatory, not optional. It prevents the #1 source of bugs (zombie processes on 8000/3000). The step now also *verifies* ports are free and falls back to `taskkill //F //IM python.exe` when an orphaned reloader lingers.
- **Orphaned `--reload` uvicorn (the trap that bit us)** — `--reload` spawns a reloader parent + worker child. If a prior session's worker is killed but the parent lingers, `netstat` may still show port 8000 LISTENING under a PID that `tasklist` reports as "not found" (stale socket / cross-session orphan). A new uvicorn then starts *behind* the stale one, and code edits silently fail to reload — the server looks "healthy" but serves old routes (observed: new routes 404 despite the file being saved). The `taskkill //F //IM python.exe` fallback in step 1c is the reliable cure. This is also why step 1 verifies *free*, not just *killed*.
- All services run natively on Windows (not in Docker containers)
- Only infra (PostgreSQL + Redis) runs in Docker
- Use `--pool=solo` for Celery on Windows (prefork not supported)
- Celery must consume `-Q celery,transcription_gpu` (both queues) locally — see step 6.
- The venv Python is at `backend/.venv/Scripts/python.exe`
- If frontend starts on 3001 instead of 3000, it means port 3000 is still occupied — the step-1 verify should have caught this; re-run the kill step.

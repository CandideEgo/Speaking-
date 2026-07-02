# Speaking Dev — Service Lifecycle

Manage the Speaking app services (start, stop, restart) on Windows.

## Trigger
- `/dev` or `/speaking-dev` — start all services
- `/dev-stop` — stop all services
- `/dev-restart` — restart all services (stop + clean cache + start)

## Context
This is a full-stack English speaking practice app with 4 runtime services:
- **Backend**: FastAPI via uvicorn on :8000
- **Cloud Celery**: background worker (pool=solo) on the `celery` queue — video head/tail, localize, orders, watchdog
- **GPU Worker**: Celery worker (pool=solo, concurrency=1) on the `transcription_gpu` queue — WhisperX transcription on local GPU, with Redis heartbeat
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
   cd C:/Users/Administrator/Speaking/backend && PYTHONUTF8=1 .venv/Scripts/python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   Run in background with `run_in_background: true`.

6. **Start cloud Celery worker** (pool=solo for Windows) — consumes **only** the `celery` queue:
   ```bash
   cd C:/Users/Administrator/Speaking/backend && PYTHONUTF8=1 .venv/Scripts/python.exe -m celery -A app.tasks.celery_app worker --pool=solo -Q celery --loglevel=info
   ```
   Run in background with `run_in_background: true`.

   This worker runs the head/tail of the video pipeline (`process_video`, `finalize_video`), localize, orders, and watchdog — everything **except** transcription. It does NOT touch `transcription_gpu`, which is drained exclusively by the GPU worker (step 6b). This mirrors production topology (`docker-compose.prod.yml` cloud worker runs `-Q celery`); locally both workers run on the same machine but on separate queues, so they never contend for the same task. Without splitting queues, the cloud worker (no GPU) would steal transcription tasks and fall back to slow CPU Whisper.

6b. **Start local GPU worker** — consumes `transcription_gpu` + emits Redis heartbeat:
   ```bash
   cd C:/Users/Administrator/Speaking/backend && PYTHONUTF8=1 .venv/Scripts/python.exe scripts/start_gpu_worker.py
   ```
   Run in background with `run_in_background: true`.

   This is a Celery worker (concurrency=1, solo) that runs WhisperX transcription on the local GPU (RTX 3060 Ti). It sends a Redis heartbeat every 60s (key `worker:gpu:heartbeat`, TTL 90s) so the admin VideoManager page shows "Worker 在线". The backend `.venv` already has `whisperx` + `torch+CUDA` installed, so it uses the same venv as everything else — no separate Python312 needed. If this worker is not running, transcription tasks sit in `transcription_gpu` forever and the admin page shows "Worker 离线".

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
   If backend returns `{"status":"ok"}` and frontend returns HTML, all good. Also confirm in the startup logs: the cloud worker (step 6) registered only the `celery` queue, and the GPU worker (step 6b) registered `transcription_gpu` + printed `[heartbeat] started`. Both should list the 5 video tasks.

9. **Report status**:
   ```
   === Speaking — all services started ===
     Backend    → http://localhost:8000/docs
     Frontend   → http://localhost:3000
     Cloud Cel  → pool=solo, queue: celery (head/tail/localize/orders/watchdog)
     GPU Worker → queue: transcription_gpu, heartbeat → admin shows 在线
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
- **Queue split** — the cloud worker (step 6) consumes `-Q celery` only; the GPU worker (step 6b) consumes `transcription_gpu` only. This mirrors production (`docker-compose.prod.yml` cloud worker = `-Q celery`, remote GPU worker = `transcription_gpu`). Locally both run on one machine but never contend. Do NOT make the cloud worker consume both queues — it has no GPU and would steal transcription tasks.
- The venv Python is at `backend/.venv/Scripts/python.exe` (has whisperx + torch+CUDA — GPU worker uses the same venv)
- If frontend starts on 3001 instead of 3000, it means port 3000 is still occupied — the step-1 verify should have caught this; re-run the kill step.
- **`PYTHONUTF8=1` on every Python service (backend, celery, gpu)** — Windows Python defaults to the OS locale codec (GBK on a Chinese Windows) for `open()` calls that don't pass an explicit encoding. The app assumes UTF-8 (it runs on Linux in prod). Without `PYTHONUTF8=1` the backend crashes at startup: slowapi's `Limiter` reads `.env` via starlette `Config` with the locale codec and hits `UnicodeDecodeError: 'gbk' codec` on the UTF-8 em-dash in a comment and the Chinese `ALIYUN_SMS_SIGN_NAME` value. `PYTHONUTF8=1` (Python UTF-8 mode) makes `open()` default to UTF-8, matching Linux — the comprehensive fix. Celery/GPU don't crash (they don't import `app.core.limiter`) but it's set on all three for consistency and to guard against latent locale-encoding bugs in tasks.

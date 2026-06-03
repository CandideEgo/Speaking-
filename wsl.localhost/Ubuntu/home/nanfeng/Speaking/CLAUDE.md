# CLAUDE.md — Speaking

## Project

AI-powered English speaking practice app.
- **Backend**: Python FastAPI + SQLAlchemy async + Celery + PostgreSQL + Redis
- **Frontend**: Next.js 14 + React 18 + Tailwind CSS
- **Media**: yt-dlp + ffmpeg for video processing (local filesystem, OSS for CDN)
- **Auth**: JWT (python-jose)
- **AI**: OpenAI-compatible API (currently Kimi)

## Dev

```bash
docker compose -f docker-compose.dev.yml up -d   # DB + Redis only

cd backend  && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
cd backend  && celery -A app.tasks.celery_app worker --loglevel=info
```

App services run natively — no Docker build on code change.
`.env` at backend root has API keys (gitignored). Copy `.env.example` for local setup.

## Deploy

```bash
docker compose -f docker-compose.prod.yml up -d
```

Production compose uses gunicorn + standalone Next.js output. Secrets via shell env.
Frontend Dockerfile.prod is multi-stage (`output: "standalone"` → minimal runner image).

## Key files

| File | Role |
|------|------|
| `docker-compose.dev.yml` | Infra only (db, redis) |
| `docker-compose.prod.yml` | Full prod stack |
| `backend/Dockerfile` | Dev & prod backend image |
| `frontend/Dockerfile.prod` | Multi-stage prod frontend |
| `backend/.env.example` | Env var template |
| `backend/app/` | FastAPI application |
| `frontend/src/` | Next.js application |

---
---
title: Development Setup
tags: [workflow, dev, docker]
status: active
confidence: verified
related_code: [docker-compose, env-config]
related: [wiki/guides/testing.md]
created: 2026-07-21
updated: 2026-07-21
---

# Local Development

## Start Infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d   # DB + Redis only (required first)
```

## Start Services

```bash
cd backend  && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
cd backend  && celery -A app.tasks.celery_app worker --loglevel=info
```

App services run natively — no Docker build on code change.

## Environment

`.env` at backend root has API keys (gitignored). Copy `.env.example` for local setup.

Required: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `OPENAI_API_KEY`

## Production Deploy

```bash
docker compose -f docker-compose.prod.yml up -d
```

Production: gunicorn (4 workers) + nginx (SSL/reverse proxy) + standalone Next.js. Secrets via shell env or `.env`.

## Video Seeding

```bash
cd backend
python scripts/seed_official_videos.py              # create all videos
python scripts/seed_official_videos.py --dry-run     # preview only
python scripts/seed_official_videos.py --category ted
python scripts/seed_official_videos.py --force       # re-fetch metadata + subtitles
```

Idempotent: skips by `source_url`. Incremental: add to `OFFICIAL_VIDEOS` list and re-run.

## GPU Worker Setup

See `docs/operations/GPU-WORKER-SETUP.md`.

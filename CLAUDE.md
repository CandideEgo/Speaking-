# CLAUDE.md — Speaking

## Project

AI-powered English speaking practice app.
- **Backend**: Python FastAPI + SQLAlchemy async + Celery + PostgreSQL + Redis
- **Frontend**: Next.js 14 + React 18 + Tailwind CSS + Zustand (state)
- **Media**: yt-dlp + ffmpeg for video processing (local filesystem, OSS for CDN)
- **Auth**: JWT (python-jose), role-based (user/admin)
- **AI**: OpenAI-compatible API (currently Kimi)
- **Speech**: faster-whisper (local, int8 quantized) for transcription

## Dev

```bash
docker compose -f docker-compose.dev.yml up -d   # DB + Redis only

cd backend  && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
cd backend  && celery -A app.tasks.celery_app worker --loglevel=info
```

App services run natively — no Docker build on code change.
`.env` at backend root has API keys (gitignored). Copy `.env.example` for local setup.
`docker compose up -d` runs the full stack in Docker (all services).

## Test

```bash
cd backend && pytest tests/ -v
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

CI runs on push/PR via `.github/workflows/ci.yml`.

## Deploy

```bash
docker compose -f docker-compose.prod.yml up -d
```

Production compose: gunicorn (4 workers) + nginx (SSL/reverse proxy) + standalone Next.js.
Secrets via shell env or `.env`.

## Key files

| File | Role |
|------|------|
| `REQUIREMENTS.md` | PRD — 92 项功能需求、数据模型、API 清单 |
| `DESIGN.md` | 设计系统 — 颜色、排版、组件规范 |
| `ARCHITECTURE.md` | 架构决策记录 (ADR) + 系统全景 |
| `SECURITY.md` | 威胁模型 + 安全策略 + 已知漏洞 |
| `PROGRESS.md` | 开发进度追踪 + Phase 7 范围 |
| `PRODUCTION.md` | 生产上线指南 |
| `RUNBOOK.md` | 运维手册 + 故障响应 |
| `FRONTEND-ARCHITECTURE.md` | 前端架构 + Watch 页面拆分计划 |
| `API-REFERENCE.md` | API 约定 + 端点一览 |
| `CONTRIBUTING.md` | 贡献指南 + 代码规范 + 提交格式 |
| `docker-compose.dev.yml` | Infra only (db, redis) |
| `docker-compose.yml` | Full dev stack (all services) |
| `docker-compose.prod.yml` | Prod stack (nginx, gunicorn) |
| `backend/Dockerfile` | Dev & prod backend image |
| `frontend/Dockerfile.prod` | Multi-stage prod frontend |
| `backend/.env.example` | Env var template |
| `backend/app/` | FastAPI application |
| `backend/app/models/` | SQLAlchemy models (User, Video, Subtitle, SpeakingAttempt, LearningRecord, Vocabulary, InviteCode, Order, SpeakingRubric) |
| `backend/app/api/v1/` | API route modules (auth, users, videos, speaking, vocabulary, ai, payments, invite-codes, browse, community, rubrics, youtube) |
| `backend/tests/` | pytest test suite |
| `frontend/src/` | Next.js application |
| `frontend/src/stores/` | Zustand stores (watchStore) |
| `frontend/src/components/` | React components (learning modes, video, subtitle, speaking, layout) |

---
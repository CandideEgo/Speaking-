# CLAUDE.md — Speaking

## Project

AI-powered English speaking practice app.
- **Backend**: Python FastAPI + SQLAlchemy async + Celery + PostgreSQL + Redis
- **Frontend**: Next.js 14 + React 18 + Tailwind CSS + Zustand (state)
- **Media**: yt-dlp + ffmpeg for video processing (local filesystem, OSS for CDN)
- **Auth**: JWT (python-jose), role-based (user/admin)
- **AI**: OpenAI-compatible API (Agnes AI via Agnes Gateway)
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
| `backend/app/tasks/` | Celery tasks (video_processing, audio_transcription) |
| `backend/seed_official_videos.py` | Seed script for official homepage videos |
| `backend/tests/` | pytest test suite |
| `frontend/src/` | Next.js application |
| `frontend/src/stores/` | Zustand stores (watchStore) |
| `frontend/src/components/` | React components (learning modes, video, subtitle, speaking, layout) |

## Video Seeding

### Selection Criteria

Official videos for the homepage are curated by engagement metrics:
1. **Content quality**: Real, natural English conversation/speech; avoid memes/music-only
2. **Engagement**: High `like_count` and `comment_count` (proxy for quality and interest)
3. **Topic diversity**: Cover TED, interviews, news, educational, daily life, tech, etc.
4. **Stability**: Well-known videos less likely to be removed
5. **Duration**: 2-20 minutes (optimal for learning sessions)
6. **Difficulty spread**: From slow/clear (A2) to fast/complex (C1)

### Seed Script Usage

```bash
cd backend

# First run — create all videos
python seed_official_videos.py

# Preview what would be seeded (no DB changes)
python seed_official_videos.py --dry-run

# Add only a specific category
python seed_official_videos.py --category ted

# Force re-seed existing videos (re-fetch metadata + subtitles)
python seed_official_videos.py --force
```

**Key features:**
- **Idempotent**: Skips videos already in DB by `source_url`
- **Incremental**: Add new videos to `OFFICIAL_VIDEOS` list; re-run script
- **No DB deletion needed**: Only new videos are inserted

### Adding New Videos

1. Edit `backend/seed_official_videos.py`
2. Append to `OFFICIAL_VIDEOS` list:
```python
{"id": "VIDEO_ID", "category": "ted",
 "title": "Video Title",
 "likes": 100000, "comments": 5000, "duration_min": 12}
```
3. Run `python seed_official_videos.py`

### Subtitle Pipeline

- **YouTube videos**: yt-dlp extracts auto-captions (JSON3/VTT/SRT)
- **Local files**: faster-whisper (local, int8 quantized) transcribes audio
- **Translation**: OpenAI-compatible API (Kimi) translates English → Chinese in batches of 20
- **Storage**: Subtitles saved to DB (`subtitles` table) with `text_en` and `text_zh`

---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Speaking-** (2126 symbols, 3161 relationships, 58 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Rules

- **Run `gitnexus_impact({target, direction: "upstream"})` before editing any symbol** — report blast radius (direct callers, affected processes, risk level). HIGH/CRITICAL warnings must be surfaced to the user before proceeding.
- **Run `gitnexus_detect_changes()` before committing** to verify changes only affect expected symbols and execution flows.
- **Use `gitnexus_rename` for renames** — it understands the call graph; never use find-and-replace.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping.
- When you need full context on a symbol, use `gitnexus_context({name: "symbolName"})` for callers, callees, and process participation.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Speaking-/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Speaking-/clusters` | All functional areas |
| `gitnexus://repo/Speaking-/processes` | All execution flows |
| `gitnexus://repo/Speaking-/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Components area (39 symbols) | `.claude/skills/generated/components/SKILL.md` |
| Work in the V1 area (36 symbols) | `.claude/skills/generated/v1/SKILL.md` |
| Work in the Video area (26 symbols) | `.claude/skills/generated/video/SKILL.md` |
| Work in the Tasks area (17 symbols) | `.claude/skills/generated/tasks/SKILL.md` |
| Work in the Services area (13 symbols) | `.claude/skills/generated/services/SKILL.md` |
| Work in the Tests area (13 symbols) | `.claude/skills/generated/tests/SKILL.md` |
| Work in the Models area (12 symbols) | `.claude/skills/generated/models/SKILL.md` |
| Work in the [id] area (12 symbols) | `.claude/skills/generated/id/SKILL.md` |
| Work in the Hooks area (7 symbols) | `.claude/skills/generated/hooks/SKILL.md` |
| Work in the Browse area (6 symbols) | `.claude/skills/generated/browse/SKILL.md` |
| Work in the Community area (6 symbols) | `.claude/skills/generated/community/SKILL.md` |
| Work in the Subtitle area (5 symbols) | `.claude/skills/generated/subtitle/SKILL.md` |
| Work in the Vocabulary area (4 symbols) | `.claude/skills/generated/vocabulary/SKILL.md` |
| Work in the Api area (3 symbols) | `.claude/skills/generated/api/SKILL.md` |

<!-- gitnexus:end -->

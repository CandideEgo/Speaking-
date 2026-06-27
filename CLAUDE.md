# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AI-powered English speaking practice app for Chinese learners. Users paste video URLs (YouTube/Bilibili), the system generates bilingual subtitles via WhisperX, and users practice speaking with AI pronunciation feedback, rubric scoring, and SM-2 spaced vocabulary review.

**Stack**: Python FastAPI (async) + SQLAlchemy async + Celery + PostgreSQL + Redis | Next.js 14 (App Router) + React 18 + Tailwind CSS + Zustand v5

**AI**: OpenAI-compatible API (Agnes AI via Agnes Gateway) | **Speech**: WhisperX + faster-whisper (local GPU) | **Media**: yt-dlp + ffmpeg

## 图片处理规范 (MUST FOLLOW)

**遇到图片绝对不要用 Read 工具直接读取** —— 会报错甚至卡死会话。必须调用 `/image-vision` skill。

**图片视觉内容一律走 `/image-vision` skill**（它走单独的视觉端点，把图片作为该 skill 的输入处理，**不会把 image block 塞进主对话历史**）。两种正确用法：
- 需要理解/描述/OCR/问答图片内容时 → 调 `/image-vision` skill，绝不直接把图片粘贴进主对话。
- 需要用 Read 看截图/UI 时 → 同样先走 `/image-vision`。

**严禁把图片直接粘贴进主对话**：图片会以 base64 image block 永久留在会话历史里。每轮请求 Claude Code 会把整段历史发给 API，而当前主模型端点（glm-5.2 等）不支持图片 → 每一轮都会因历史里那张图而报错，换模型也治不好，因为图一直在历史里被反复发送。这就是"会话卡死、换模型仍持续报错"的根因。

**已踩过的坑 / 修复手段**：若某段会话历史已含图片块导致 resume 持续报错，可手动编辑该 session 的 `.jsonl`（位于 `~/.claude/projects/<proj>/<session-id>.jsonl`），把 `"type":"image"` 块替换为 `"type":"text"` 的文字说明（保留其余文字上下文），即可恢复 resume。先备份原文件。

## Dev

```bash
docker compose -f docker-compose.dev.yml up -d   # DB + Redis only (required first)

cd backend  && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
cd backend  && celery -A app.tasks.celery_app worker --loglevel=info
```

App services run natively — no Docker build on code change.
`.env` at backend root has API keys (gitignored). Copy `.env.example` for local setup.

## Test

```bash
# Backend
cd backend && pytest tests/ -v
cd backend && pytest tests/test_ai_cache.py -v          # single test file
cd backend && pytest tests/test_ai_cache.py::test_fn -v  # single test

# Frontend
cd frontend && npx tsc --noEmit && npm run lint && npm run build
cd frontend && npm run check   # typecheck + lint + format:check (used by pre-commit)
```

CI runs on push/PR via `.github/workflows/ci.yml`.

## Lint & Format

Pre-commit hooks (`.pre-commit-config.yaml`): ruff (lint+format) on `backend/`, prettier on `frontend/`, trailing-whitespace/end-of-file-fixer/check-yaml/large-files/private-key/no-commit-to-master.

```bash
pre-commit run --all-files   # run all hooks manually
```

Backend: ruff config in `backend/pyproject.toml`. Frontend: eslint + prettier.

## Deploy

```bash
docker compose -f docker-compose.prod.yml up -d
```

Production: gunicorn (4 workers) + nginx (SSL/reverse proxy) + standalone Next.js. Secrets via shell env or `.env`.

---

## Architecture

### Video Processing Pipeline (Split Head/GPU/Tail)

This is the most complex subsystem. The pipeline is split across three Celery tasks bridged by HTTP callback:

```
process_video (head, cloud worker, default queue)
  → extract metadata (yt-dlp/ffprobe)
  → stage local uploads to OSS (signed URL for GPU)
  → enqueue transcribe_video_gpu

transcribe_video_gpu (GPU worker, transcription_gpu queue)
  → WhisperX transcription (NO database access, NO OSS credentials)
  → POST callback to cloud /api/v1/internal/transcription/callback

finalize_video (tail, cloud worker, triggered by callback)
  → translate subtitles (AI batch)
  → annotate exam words (ECDICT, local)
  → prewarm AI word notes (batch LLM)
  → download video + transcode (ffmpeg 480p/720p/1080p)
  → mark ready
```

**Queue topology**: `celery` (default) = cloud worker (head/tail/localize/comments/orders); `transcription_gpu` = remote GPU worker (transcription only). Configured in `backend/app/tasks/celery_app.py` with `task_routes`.

**Progress tracking**: Redis sets `video:steps:{id}` (resume support — each step checks `_is_step_done()`), Redis pub/sub `video:progress:{id}`, DB `processing_step`/`processing_progress` for public API.

**Beat schedule**: `expire-pending-orders` every 5 min, `watchdog-stale-transcriptions` every 10 min.

### Async in Celery Tasks

Celery workers are synchronous. Do NOT use `asyncio.run()` per task. Use `run_async()` from `backend/app/tasks/async_helpers.py` — it maintains one long-lived event loop in a daemon thread via `asyncio.run_coroutine_threadsafe()`.

```python
@celery_app.task
def my_task(arg):
    result = run_async(_do_work(arg))
    return result

async def _do_work(arg):
    ...
```

### Backend Service Layer

Route handlers (`api/v1/`) handle HTTP concerns (validation, status codes, auth deps). Services (`services/`) handle domain logic. Keep route files thin.

**Key services**:
- `ai_service.py` — Central AI wrapper (AsyncOpenAI). Singleton via `get_ai_service()`. Redis caching for enrichment/gloss. Methods: translate_batch, pronunciation_feedback_rubric, free_speaking_feedback, gloss_word_context, generate_practice_questions, etc.
- `speaking_service.py` — Pipeline: Whisper transcription → wav2vec2 forced alignment → AI rubric scoring. Free-tier limit (3/day).
- `video_service.py` — Video submit (dedup by URL), detail with Redis caching, search (PostgreSQL FTS + ILIKE fallback).
- `vocabulary_service.py` — SM-2 spaced repetition, AI enrichment, quiz.
- `transcription/` — Dedicated sub-service: WhisperX/faster-whisper, chunked transcription, forced alignment, punctuation restoration, audio extraction, segment formatting.

### Auth Dependencies (`api/dependencies.py`)

- `get_current_user` — JWT decode + blacklist check + password-change staleness check + DB user fetch
- `get_optional_user` — Same but returns `None` instead of 401 (for public pages with optional auth)
- `get_admin_user` — Stacks on `get_current_user`, checks `role == admin`
- `require_pro_user` — Checks plan type and expiry
- `check_video_access` / `require_video_access` — Official videos are public; user-submitted require ownership

### Dual Auth Sessions (Frontend)

User app and admin console use separate localStorage token keys (`speaking_token` vs `speaking_admin_*`). Both use the same backend JWT/role system but independent sessions. Logging out of one doesn't affect the other.

### Frontend API Client (`lib/api.ts`)

Custom `api<T>(path, options)` with: auto JWT attachment, pre-request token expiry check with auto-refresh, 401 handling (refresh → retry → logout), 5xx retry (max 2, exponential backoff), `ApiError` class with status + server error code, `mediaUrl()` helper for `/media/` paths.

### Frontend State (Zustand)

5 stores in `frontend/src/stores/`:
- `authStore.ts` — JWT auth with auto-refresh on expiry. Mutex on refresh to prevent duplicate calls.
- `adminAuthStore.ts` — Separate admin auth.
- `watchStore.ts` — Video player UI state (subtitle mode, panel collapse/width, exam level for word highlighting).
- `vocabularyStore.ts` — Word list, stats, quiz sessions, SM-2 review actions.
- `communityStore.ts` — Posts feed (paginated infinite scroll), create/like/unlike.

### Exam-Level Vocabulary System

ECDICT dictionary annotations run locally (no AI) at ingest time, tagging each word with exam levels (CET4/6, gaokao, etc.). The display filters by user's `target_exam_level`. AI notes are pre-warmed per-video during the finalize pipeline. Config in `backend/app/core/exam_levels.py`.

---

## Key Patterns

- **Fail-open Redis**: Cache, token blacklist, and rate limiting all degrade gracefully when Redis is unavailable. The app never crashes due to a Redis outage.
- **Lazy initialization**: DB engine, Redis client, AI service, and Whisper model are all created lazily on first use, so processes that don't need them (e.g., GPU worker without DB) can import the modules without side effects.
- **Singleton patterns**: `get_settings()` (lru_cache), `get_redis()` (module global), `get_ai_service()` (thread-safe double-checked locking), `get_whisper_model()`.
- **Translation engine**: Pluggable — `agnes` (default) / `hy_mt2` / `qwen` / `custom`, with optional fallback engine. Config in `Settings.translation_engine`.

---

## Key files

| File | Role |
|------|------|
| `docs/api/REQUIREMENTS.md` | PRD — 92 项功能需求、数据模型、API 清单 |
| `docs/architecture/ARCHITECTURE.md` | 架构决策记录 (ADR) + 系统全景 |
| `docs/progress/PROGRESS.md` | 开发进度追踪 (Phase 1-10 全部完成) |
| `docs/architecture/FRONTEND-ARCHITECTURE.md` | 前端架构 + Watch 页面拆分计划 |
| `docs/api/API-REFERENCE.md` | API 约定 + 端点一览 |
| `docs/plans/WORKFLOW.md` | 开发工作流 — 功能开发流程、质量门禁 |
| `CONTRIBUTING.md` | 贡献指南 + 代码规范 + 提交格式 + 反模式清单 |
| `backend/app/core/config.py` | Pydantic BaseSettings (~60 env vars), dev defaults, translation engine config |
| `backend/app/tasks/async_helpers.py` | `run_async()` — shared event loop for Celery tasks |
| `backend/app/tasks/celery_app.py` | Queue topology, task routes, beat schedule |
| `backend/app/tasks/video_processing.py` | Video pipeline head/tail + progress tracking |
| `backend/app/api/dependencies.py` | Auth deps: get_current_user, require_pro_user, require_video_access |
| `backend/app/services/transcription/` | WhisperX pipeline: model loading, chunked transcription, alignment, formatting |
| `backend/.env.example` | Env var template (required: DATABASE_URL, REDIS_URL, JWT_SECRET, OPENAI_API_KEY) |
| `frontend/src/lib/api.ts` | API client with JWT auto-refresh + retry logic |
| `frontend/src/stores/` | Zustand stores (auth, adminAuth, watch, vocabulary, community) |
| `frontend/src/types/index.ts` | All TypeScript interfaces (~365 lines) |

## Video Seeding

```bash
cd backend
python seed_official_videos.py              # create all videos
python seed_official_videos.py --dry-run     # preview only
python seed_official_videos.py --category ted
python seed_official_videos.py --force       # re-fetch metadata + subtitles
```

Idempotent: skips by `source_url`. Incremental: add to `OFFICIAL_VIDEOS` list and re-run.

---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Speaking-** (5525 symbols, 9048 relationships, 261 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Development Workflow (GitNexus-First)

When receiving a new feature request or bug fix, follow this sequence to minimize exploration time:

1. **Locate** → `query({query: "需求关键词", goal: "找到相关执行流"})` — 1 call replaces 5-10 grep/file reads
2. **Understand** → `context({name: "核心符号"})` — 1 call gives callers + callees + process participation (no need to read multiple files)
3. **Assess risk** → `impact({target: "要改的符号", direction: "upstream"})` — know blast radius before writing any code
4. **Implement** → make changes, using `context()` on any unfamiliar symbol encountered mid-edit
5. **Verify scope** → `detect_changes()` — confirm changes only touch expected symbols/flows before committing

**Shortcut patterns:**
- "改 X 功能" → skip step 1-2 if you already know the symbol, go straight to `impact()` then implement
- "加新功能" → `query()` to find similar existing flows, then model after them
- "修 bug" → `query()` to trace the failing flow, `context()` on the suspect symbol
- "重构/重命名" → `impact()` first, then `rename()` for the actual rename

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

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

<!-- gitnexus:end -->

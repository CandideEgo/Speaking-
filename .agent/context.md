# Project Context

## Purpose

AI-powered English vocabulary learning app for Chinese learners. Users paste video URLs (YouTube/Bilibili), the system generates bilingual subtitles via WhisperX, annotates exam-level vocabulary (CET/gaokao) via ECDICT, and drives SM-2 spaced repetition review + community UGC. Speaking recording is playback-only (no AI scoring — ADR-0002).

## System Understanding

```
                    User
                      │
                      ▼
              ┌───────────────┐
              │   Next.js 16  │  Frontend
              │   App Router   │
              └───────┬───────┘
                      │ api.ts (JWT auto-refresh)
                      ▼
              ┌───────────────┐
              │   FastAPI      │  Backend API
              │   async        │
              └───┬───────┬───┘
                  │       │
          ┌───────▼──┐  ┌─▼──────────┐
          │ Services  │  │ Dependencies│
          │ ai/video/ │  │ auth/plan/  │
          │ vocab     │  │ access      │
          └───────┬──┘  └─────────────┘
                  │
          ┌───────▼──────────────────────┐
          │        Celery Workers        │
          │  ┌─────────┐  ┌───────────┐ │
          │  │  Head   │  │   Tail    │ │
          │  │(process)│  │(finalize) │ │
          │  └────┬────┘  └───────────┘ │
          └───────┼─────────────────────┘
                  │ enqueue
          ┌───────▼──────────────────────┐
          │     GPU Worker               │
          │     WhisperX (no DB/OSS)     │
          │     → HTTP callback          │
          └──────────────────────────────┘
                  │
          ┌───────▼──┐  ┌──────────────┐
          │PostgreSQL │  │    Redis     │
          │  Models   │  │ cache/queue  │
          └──────────┘  └──────────────┘
```

Key patterns: Fail-open Redis. Lazy initialization. Celery async bridge (`run_async()`). Pluggable translation engine. Dual auth sessions.

For pipeline details, see wiki/architecture/video-pipeline.md.
For service layer details, see wiki/architecture/backend-services.md.

## Important Flows

1. **Video processing**: submit URL → dedup → Head/GPU/Tail → checkpoint resume → ready
2. **Vocabulary learning**: watch video → click word → AI lookup (Pro) → vocabulary book → SM-2 review
3. **Redemption code**: input code → row lock → plan=pro + extend 30 days → atomic

## Important Constraints

- GPU Worker must not have DB access or OSS credentials — security boundary
- Redis must not be single point of failure — all Redis dependencies must fail-open
- Tailwind v4 is CSS-first — must not create tailwind.config.js
- New components must use semantic tokens, not hardcoded color values
- UGC videos must not be auto-processed — admin-triggered only (ADR-0004)
- Payment disabled (ICP compliance) — redemption code channel only
- For image handling in agent sessions, see wiki/problems/image-handling.md

## Known Issues

- `InviteCode` → renamed to `RedeemCode` — DONE
- Community page had availability issues, current status unconfirmed
- docs/architecture/SYSTEM-MAP.md is severely outdated — many listed bugs have been fixed
- E2E test coverage is the only incomplete completion criteria item

## Future Agent Notes

- AI calls must go through `ai_service.py`, never AsyncOpenAI directly in routes
- Dark mode: `.dark` variable block cascades entire site, new components auto-support
- 5 Zustand stores: authStore, adminAuthStore, feedStore (replaces communityStore per ADR-0011), watchStore, vocabularyStore
- authStore and adminAuthStore are separate implementations — no shared factory (createAuthStore was planned but not implemented, reference removed from code)
- Error handling unified through `core/errors.py`, frontend reads `err.code`
- ECDICT database ~30MB, downloaded via scripts, in `.gitignore`
- Beat tasks: expire-pending-orders every 5 min, watchdog-stale-transcriptions every 10 min

## Key Files

| File | Role |
|------|------|
| `docs/PRD.md` | PRD (authoritative) |
| `docs/adr/` | Architecture Decision Records |
| `docs/progress/PROGRESS.md` | Development progress tracking |
| `CONTRIBUTING.md` | Contribution guide + code standards |
| `backend/app/core/config.py` | Pydantic BaseSettings (~60 env vars) |
| `backend/app/tasks/video_processing.py` | Video pipeline head/tail |
| `backend/app/api/dependencies.py` | Auth deps |
| `backend/app/services/ai_service.py` | Central AI wrapper |
| `frontend/src/lib/api.ts` | API client with JWT auto-refresh |
| `frontend/src/stores/` | Zustand stores |
| `frontend/src/types/index.ts` | All TypeScript interfaces |

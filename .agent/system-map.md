# System Map

> Module responsibilities, non-obvious dependencies, critical paths and external boundaries.
> This is the architecture picture. The rules that must keep holding live in `invariants.md`;
> per-subsystem depth lives in `wiki/architecture/`.

## System Overview

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

## Module Overview

| Module | Responsibility |
|--------|---------------|
| `api/v1/*` | REST route handlers, thin layer delegating to services |
| `api/dependencies.py` + `core/security.py` | Auth dependencies, JWT, dual sessions |
| `services/video_*` | Video CRUD, seeding, caching, publish, review, thumbnail, URL guard |
| `services/catalog_service` + `api/v1/catalog` | Candidate pool (ADR-0017): crawl import + `fit_score` ranking + per-item promote reusing the seed pipeline |
| `services/channel_service` | Official curated channels (ADR-0014) + auto-channel creation at ingest |
| `services/transcription/*` | WhisperX transcription + wav2vec2 alignment + hallucination detection |
| `services/translation/*` | Pluggable translation engine (currently `ark-code-latest`, ADR-0018) + exponential-backoff retry + quality gate |
| `services/ai_service` | Central AI singleton — runtime callers are the video pipeline only (word-note prewarm) |
| `services/vocabulary_service` + `sr_service` | SM-2 spaced repetition |
| `services/vocab_set_service` | Vocab sets + quick-sieve loop (ADR-0019): collection-scoped flow state over Vocabulary rows |
| `services/ecdict` + `exam_corpus` + `word_notes` | The three gloss sources: local exam-level annotation (no AI) + past-paper sentences + pre-generated AI notes |
| `services/unlock_service` | Free-tier access rules: login wall + unlock quotas (quota path retired for 内测期, endpoints answer allow/empty) |
| `services/payment_provider` + `alipay/wechat/mock` | Multi-provider payment, factory pattern (disabled for ICP compliance; redemption code is the only channel) |
| `services/learning_event_service` + `profile_service` + `milestone_service` | Non-blocking LearningEvent emission + profile aggregation (streak / mastery / milestones) |
| `services/recommendation_service` + `scoring_service` + `ranking_service` | Video `learning_score` (7-factor + bonus), recommendation feed, rankings |
| `services/shadowing_service` | Shadowing recording persistence + LearningEvent (ADR-0013; no AI scoring) |
| `services/notification_service` | Cross-cutting: DB write + best-effort WebSocket push + actor-aware dedup |
| `services/video_access.py` + `video_cache.py` | Media gating and cache invalidation (see `wiki/problems/cache-invalidation-and-media-gate-blindspots.md`) |
| `tasks/video_processing` | Head/GPU/Tail pipeline + checkpoint resume + watchdog + `prewarm_notes` |
| `tasks/scoring_tasks` + `ranking_tasks` | `learning_score` (hourly top + daily full) + daily ranking snapshots |
| `tasks/order_tasks` + `redeem_tasks` | Order expiry beat + async redemption (the Pro-downgrade beat is parked, not removed) |
| `tasks/reminder_tasks` + `report_tasks` | Vocabulary reminders (hourly, per user timezone) + weekly reports (the Pro-expiry reminder beat is parked) |
| `core/*` | Config, database, redis, security, errors, cache, limiter, logging |
| `frontend/src/app/(main)/*` | User-facing pages: home / browse / watch / vocabulary / history / exams |
| `frontend/src/app/(admin)/*` | Admin panel: videos / users / stats / invites / orders / channels |
| `frontend/src/stores/*` | 6 Zustand stores: auth, adminAuth, feed, watch, vocabulary, plan (plan is profile-only now) |
| `frontend/src/lib/api.ts` | API client with JWT auto-refresh |

## Dependencies — Non-obvious

```
ai_service ←── video pipeline (finalize: translation via services/translation + prewarm notes)

transcription/whisper_model ←── video pipeline (GPU worker)

notification_service ←── payment callbacks
                     ←── invite/redeem
                     (actor-aware dedup: same actor → update, different actors → separate)

video_processing (finalize auto_publish) 与 admin approve_review
                            共享 video_publish._publish_video（single source of truth，
                            字段一致；approve_review 为遗留 UGC 语义，dormant）
```

## Data Flow — Critical Paths

1. **Video pipeline**: admin seed / catalog promote → dedup → Head(extract+stage+enqueue) → GPU(WhisperX→HTTP callback) → Tail(translate+annotate+prewarm_notes+download+transcode) → ready
2. **Vocabulary loop**: watch video → click word → gloss lookup (ECDICT + past-paper sentences + pre-generated AI notes, no live LLM) → vocabulary book or vocab set → quick sieve → SM-2 review
3. **Redemption**: input code → row lock (`with_for_update`) → plan=pro + extend 30 days → atomic

## External Boundaries

| Boundary | Protocol | Notes |
|----------|----------|-------|
| Agnes AI Gateway | OpenAI-compatible HTTP | Translation, word-note prewarm (video pipeline only) |
| Alibaba Cloud OSS | Signed URLs | Media staging; the GPU worker receives a signed URL and never holds credentials |
| Alibaba Cloud SMS | HTTP | Verification codes; dev/CI falls back to the fixed code `1234` |
| PostgreSQL | SQLAlchemy async | Primary data store |
| Redis | Direct client | Cache/lock/queue/rate-limit/blacklist/progress — all fail-open |
| yt-dlp | CLI subprocess | Video download, metadata extraction, YouTube anti-bot handling |
| ffmpeg | CLI subprocess | Transcoding (480/720/1080p) |
| WhisperX | Local GPU model | Transcription + forced alignment |
| Alipay / WeChat | HTTP callback | Payment callbacks (disabled for ICP compliance) |

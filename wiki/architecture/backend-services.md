---
title: Backend Service Layer
tags: [architecture, backend, fastapi, sqlalchemy]
status: active
confidence: verified
related_code: [backend-services, ai-service, transcription]
related: [wiki/architecture/video-pipeline.md, wiki/architecture/auth-system.md]
created: 2026-07-21
updated: 2026-08-04
---

# Background

Backend uses FastAPI (async) + SQLAlchemy async + Celery + PostgreSQL + Redis. Service layer sits between Route and Model.

# Layered Architecture

```
api/v1/ (Route handlers) → HTTP concerns (validation, status codes, auth deps)
services/ (Service layer) → Domain logic
models/ (SQLAlchemy models) → Data models
schemas/ (Pydantic schemas) → Request/response models
```

Keep route files thin. Business logic in service layer.

# Key Services

| Service | Responsibility |
|---------|---------------|
| `ai_service.py` | Central AI wrapper (AsyncOpenAI). Singleton `get_ai_service()`. Redis caching for enrichment/gloss. Speaking-scoring methods removed (ADR-0002). |
| `video_service.py` | Video submit (dedup by URL), detail with Redis caching, search (PostgreSQL FTS + ILIKE fallback). |
| `vocabulary_service.py` | SM-2 spaced repetition, AI enrichment, quiz. |
| `practice_service.py` | Adaptive drill generation (video/vocabulary scoped, mastery-based item types) + batch SM-2 submit. |
| `exam_service.py` | Exam system: daily_check / video_exam / wrong_redo sessions, server-side grading (`exam_sessions`/`exam_answers`), derived wrong book, practice hub stats. Answers never leave the server in exam mode; grading reuses `submit_practice_results` for SM-2 + LearningEvents. |
| `transcription/` | Dedicated sub-service: WhisperX/faster-whisper, chunked transcription, forced alignment, punctuation restoration, audio extraction, segment formatting. |
| `learning_plan_service.py` + `learning_event_service.py` + `profile_service.py` | ADR-0012 learning plan: rule engine (到期复习→继续观看→新视频→练习→词汇), event emission (completed_video/learned_words/practiced_items/reviewed_words/shadowed_sentences), profile aggregation (streak/mastery/daily counters). |
| `ai_plan_service.py` | AI-powered daily plan generation (Pro, LLM JSON schema, Celery task). |
| `recommendation_service.py` + `scoring_service.py` | ADR-0011: 7-factor learning_score + bonus, recommendation feed (home 40/30/20/10 + category). |
| `notification_service.py` | DB write + WebSocket push (best-effort) + actor-aware dedup (`ix_notifications_dedup`). |
| `milestone_service.py` | Learning milestone tracking (incl. first_shadowing). |
| `shadowing_service.py` | 跟读录音持久化（ADR-0013）: ShadowingAttempt rows + audio blob under media/shadowing/{user_id}/, owner-only playback, LearningEvent emission. No AI scoring (ADR-0002). |
| `video_access.py` | Access-control domain functions (`check_video_access` / `check_video_access_by_owner` / `should_use_snapshot`) shared by API deps and media serving. |

# Key Patterns

- **Fail-open Redis**: Cache, token blacklist, and rate limiting all degrade gracefully when Redis is unavailable (rate limiter falls back to in-memory buckets; see `core/limiter.py`). The app never crashes due to a Redis outage.
- **Lazy initialization**: DB engine, Redis client, AI service, and Whisper model are all created lazily on first use, so processes that don't need them (e.g., GPU worker without DB) can import the modules without side effects.
- **Singleton patterns**: `get_settings()` (lru_cache), `get_redis()` (module global), `get_ai_service()` (thread-safe double-checked locking), `get_whisper_model()`.
- **Translation engine**: Pluggable — `qwen` (default) / `hy_mt2` / `agnes` / `glm` / `custom`, with optional fallback engine run concurrently (first valid wins). Agnes is retired for translation (missed/low-quality output) but still backs non-translation LLM calls in `ai_service`. Config in `Settings.translation_engine` / `translation_fallback_engine` / `translation_concurrent`.

# Future Notes

- New service methods must have Redis cache fail-open degradation
- AI calls must go through `ai_service.py`, never use AsyncOpenAI directly in routes
- New Pydantic schemas must align with frontend TypeScript types

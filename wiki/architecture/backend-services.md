---
title: Backend Service Layer
tags: [architecture, backend, fastapi, sqlalchemy]
status: active
confidence: verified
related_code: [backend-services, ai-service, transcription]
related: [wiki/architecture/video-pipeline.md, wiki/architecture/auth-system.md]
created: 2026-07-21
updated: 2026-07-25
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
| `transcription/` | Dedicated sub-service: WhisperX/faster-whisper, chunked transcription, forced alignment, punctuation restoration, audio extraction, segment formatting. |

# Key Patterns

- **Fail-open Redis**: Cache, token blacklist, and rate limiting all degrade gracefully when Redis is unavailable. The app never crashes due to a Redis outage.
- **Lazy initialization**: DB engine, Redis client, AI service, and Whisper model are all created lazily on first use, so processes that don't need them (e.g., GPU worker without DB) can import the modules without side effects.
- **Singleton patterns**: `get_settings()` (lru_cache), `get_redis()` (module global), `get_ai_service()` (thread-safe double-checked locking), `get_whisper_model()`.
- **Translation engine**: Pluggable — `agnes` (default) / `hy_mt2` / `qwen` / `glm` / `custom`, with optional fallback engine. Config in `Settings.translation_engine`.

# Future Notes

- New service methods must have Redis cache fail-open degradation
- AI calls must go through `ai_service.py`, never use AsyncOpenAI directly in routes
- New Pydantic schemas must align with frontend TypeScript types

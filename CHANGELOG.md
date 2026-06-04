# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2025-06-04

### Added

- 8 learning modes: bilingual, english-only, chinese-only, reading, dictation, fill-blank, flashcard, translate (L-01 ~ L-08)
- Component refactor: extracted SubtitleList, WordTooltip, SpeakingPanel, QuizPanel, PlaybackControls, SubtitleModeTabs
- Browse page with category-based YouTube channel discovery (C-01)
- Community page with community-recommended content (C-02)
- Difficulty level filtering on home page (A1-C2) (C-03)
- Vocabulary book with SM-2 spaced repetition (R-01, R-02, R-03)
- Speaking rubric system: models + API endpoints (SpeakingRubric, RubricCriterion, SpeakingAttemptScore)
- Quiz generation per video (V-10)
- AI word lookup with pronunciation + context definition (Pro feature) (A-01)
- AI daily summary and learning recommendations (Pro feature) (A-02, A-03)
- Grammar annotation on subtitles (S-03)
- Video difficulty evaluation (CEFR level) (S-05)

### Changed

- Migrated from openai-whisper to faster-whisper (int8 quantized, local CPU inference)
- Improved subtitle extraction: JSON3 format support, rolling-caption dedup logic
- Refactored video processing pipeline with lightweight mode (YouTube) and full mode (Bilibili)

## [0.5.0] - 2025-06-03

### Added

- Production deployment configuration: gunicorn (4 workers) + nginx (SSL/reverse proxy) + standalone Next.js
- Security hardening: bcrypt password hashing, JWT token management, CORS configuration
- Rate limiting on auth endpoints (slowapi)
- Structured logging with structlog (JSON in production, colored console in dev)
- Sentry error tracking integration
- CI pipeline via GitHub Actions (backend tests + frontend type-check/lint/build)
- E2E test setup with Playwright (auth, video flows)
- Alembic database migrations (8 migration files)
- Docker production compose (docker-compose.prod.yml)

### Changed

- Improved Celery task retry logic (max 3 retries)
- Enhanced proxy and cookies support for YouTube access in restricted regions

## [0.4.0] - 2025-06-02

### Added

- Payment system: order creation, mock pay, Alipay/WeChat callback endpoints (PAY-01, PAY-02, PAY-05)
- Invite code system: generate, redeem, export CSV, list (PAY-06 ~ PAY-09)
- Pro user tier with feature gating (AI word lookup, daily summary, recommendations)
- Admin panel: video seeding, invite code management

### Changed

- User model extended with `plan` field (free/pro) and `role` field (user/admin)

## [0.3.0] - 2025-06-01

### Added

- Speaking practice: microphone recording, faster-whisper transcription, AI pronunciation scoring (SP-01 ~ SP-10)
- Accuracy/fluency/completeness scoring with visual feedback
- Free user daily attempt limit (3/day)
- Speaking attempt history and statistics

## [0.2.0] - 2025-05-30

### Added

- Video processing pipeline: yt-dlp download, ffmpeg transcoding (480p/720p/1080p), Whisper subtitle generation
- AI batch translation (English → Chinese) via OpenAI-compatible API
- Lightweight mode for YouTube videos (embed + subtitles, no download)
- Full download mode for Bilibili/other platforms
- Duplicate video detection
- Video status tracking (processing → ready_subtitles → ready / error)

## [0.1.0] - 2025-05-28

### Added

- Project scaffolding: FastAPI backend + Next.js 14 frontend + Docker Compose
- User authentication: email registration, login, JWT tokens (U-01, U-02)
- User profile: view and edit (U-03, U-05)
- PostgreSQL 16 + Redis 7 infrastructure via Docker
- Celery + Redis task queue setup
- Basic video submission and listing (V-01, V-07)
- Bilingual subtitle display on watch page

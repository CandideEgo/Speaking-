---
title: Backend Service Layer
tags: [architecture, backend, fastapi, sqlalchemy]
status: active
confidence: verified
related_code: [backend-services, ai-service, transcription]
related: [knowledge/wiki/architecture/video-pipeline.md, knowledge/wiki/architecture/auth-system.md]
created: 2026-07-21
updated: 2026-09-28
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
| `ai_service.py` | Central AI wrapper (AsyncOpenAI). Singleton `get_ai_service()`. Redis caching for vocabulary enrichment. Public `chat_json()` for one-shot structured LLM calls. Speaking-scoring methods removed (ADR-0002). |
| `video_classification.py` | LLM video classification (DEC-042): canonical topic taxonomy (browse filter + LLM whitelist single source), topic_tags overwrite / difficulty fill-on-NULL, pipeline `classifying` step + backfill script. |
| `difficulty_service.py` | Subtitle-derived CEFR difficulty (DEC-043): per-word acquisition level = the *lowest* exam list containing it, 超纲率 = share of word occurrences above 中考, mapped to A1–C1/C2 bands; needs ≥30 occurrences. Writes `difficulty_level` only when NULL — the fallback behind `video_classification.py`'s LLM estimate. |
| `video_service.py` | 视频列表/详情（详情走 Redis 缓存）、UGC 管理与三态下线；**提交与按 URL 去重在 `video_seed_service.py`，FTS + ILIKE 检索在 `search_service.py`**。 |
| `vocabulary_service.py` | 复习调度（DEC-057：错误次数分档直接算 `interval_days`，SM-2 列保留为兼容、`ease_factor` 不再参与）、AI enrichment、stats、今日训练队列 (`build_daily_session`: new=从未复习 / due=到期非 mastered 且排序=昨天错过→`wrong_count` 降序→到期升序，两队列 + totals；`totals.due_total` 不含 new 词，与 stats 徽标的 `due_count` 口径故意不同). |
| `vocab_set_service.py` | 词汇集（收集/筛词/集合详情）；S7 起加词写 `subtitle_id`、详情透出首现句时间——词→句链路见 `exam-vocabulary.md`；S8 起 `unmark_learned`（集合态回 `unknown`、词行 `mastered→learning`+次日，两个当日队列都不进）。 |
| `study_session_service.py` | 训练轮次落库 + 每日配额（DEC-053）：`StudySession`/`StudySessionItem` 一轮一词一行、重复作答只 UPDATE；配额快照进轮次（改配额不重写历史）；`kind=extra` 加练计今日累计不计目标；`finish_session` 同事务清扫 30 天前的轮次明细。 |
| `practice_service.py` | Adaptive drill generation (video/vocabulary scoped) + 干扰项三级来源（同视频→词库编辑距离→ECDICT，见 `knowledge/plans/词汇训练与播放页返回-设计方案-2026-09.md` §8.2）；`submit_practice_results` 按词行状态分流调度：`learning/reviewing` 走 DEC-057 分档（`apply_review`），`new`/自动添加仍走冻结的 SM-2 `calculate_next_review`。 |
| `exam_service.py` | Exam system: daily_check / paper_exam / wrong_redo sessions, server-side grading (`exam_sessions`/`exam_answers`), derived wrong book, practice hub stats. Answers never leave the server in exam mode; grading only emits `LearningEvent(practiced_items)`，不驱动词行调度（`submit_practice_results` 是词汇练习自己的入口）。 |
| `transcription/` | Dedicated sub-service: WhisperX/faster-whisper, chunked transcription, forced alignment, punctuation restoration, audio extraction, segment formatting. |
| `learning_event_service.py` + `profile_service.py` | ADR-0012 学习闭环的剩余部分（规则引擎 `learning_plan_service.py` 已随 DEC-025 下线并删除）：event emission (completed_video/learned_words/practiced_items/reviewed_words/shadowed_sentences), profile aggregation (streak/mastery/daily counters)。**副作用门槛**：这些事件由行为事件驱动，只有「真的打开过该视频」（存在 `LearningRecord`）才会发出，见 DEC-050。 |
| `catalog_service.py` | 候选池策展（ADR-0017）：浏览/筛选/`mark_item`，`promote_item` 把候选交给既有 official 视频管线。**promote 是幂等复用的**：已有在途/ready 的 official `Video` 时直接复用而不重播流水线，见 DEC-049（含残留窗口）。 |
| `behavior_service.py` | 行为事件入库（ADR-0011）+ 把 `watch_time`/`complete` 镜像到 `LearningRecord`/`Video.view_count`。镜像副作用一律以 `LearningRecord` 存在为前提，未知 `video_id` 置 NULL 而非拒绝整批（DEC-050）。 |
| `recommendation_service.py` + `scoring_service.py` | ADR-0011: 7-factor learning_score + bonus, recommendation feed (home 40/30/20/10 + category). |
| `notification_service.py` | DB write + WebSocket push (best-effort) + actor-aware dedup (`ix_notifications_dedup`). |
| `milestone_service.py` | Learning milestone tracking (incl. first_shadowing). |
| `shadowing_service.py` | 跟读录音持久化（ADR-0013）: ShadowingAttempt rows + audio blob under media/shadowing/{user_id}/, owner-only playback, LearningEvent emission. No AI scoring (ADR-0002). |
| `video_access.py` | Access-control domain functions (`check_video_access` / `check_video_access_by_owner` / `should_use_snapshot`) shared by API deps and media serving. |

# Key Patterns

- **Fail-open Redis**: Cache, token blacklist, and rate limiting all degrade gracefully when Redis is unavailable (rate limiter falls back to in-memory buckets; see `core/limiter.py`). The app never crashes due to a Redis outage.
- **Lazy initialization**: DB engine, Redis client, AI service, and Whisper model are all created lazily on first use, so processes that don't need them (e.g., GPU worker without DB) can import the modules without side effects.
- **Singleton patterns**: `get_settings()` (lru_cache), `get_redis()` (module global), `get_ai_service()` (thread-safe double-checked locking), `get_whisper_model()`.
- **Translation engine**: Pluggable registry (`custom` / `qwen` / `hy_mt2` / `agnes` / `glm`) with an optional fallback run concurrently (first valid wins). **The effective primary is `custom` = 火山 ARK `ark-code-latest`** (DEC-029/ADR-0018): qwen/hy_mt2/glm lost their keys and survive only as a switch-back path, while `agnes` (proxying `OPENAI_*`) is the remaining non-ARK engine that `ai_service` still reuses for non-translation calls. Config in `Settings.translation_engine` / `translation_fallback_engine` / `translation_concurrent`.

# Future Notes

- New service methods must have Redis cache fail-open degradation
- AI calls must go through `ai_service.py`, never use AsyncOpenAI directly in routes
- New Pydantic schemas must align with frontend TypeScript types

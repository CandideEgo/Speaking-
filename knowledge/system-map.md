# System Map

> Module responsibilities, non-obvious dependencies, critical paths and external boundaries.
> This is the architecture picture. The rules that must keep holding live in `invariants.md`;
> per-subsystem depth lives in `knowledge/wiki/architecture/`.

## System Overview

```
User → Next.js 16 (App Router) ── api.ts (JWT auto-refresh)
     → FastAPI (async) ── Services (ai/video/vocab) + Dependencies (auth/plan/access)
     → Celery: Head (process) → GPU worker (WhisperX, no DB/OSS → HTTP callback)
               → Tail (finalize)   PostgreSQL (models) + Redis (cache/queue, fail-open)
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
| `services/vocabulary_service` + `sr_service` | 错误次数分档复习调度（DEC-057；SM-2 列保留兼容，`calculate_next_review` 冻结供新词/考试判分复用） |
| `services/vocab_set_service` | Vocab sets + quick-sieve loop (ADR-0019): collection-scoped flow state over Vocabulary rows |
| `services/ecdict` + `exam_corpus` + `word_notes` | The three gloss sources: local exam-level annotation (no AI) + past-paper sentences + pre-generated AI notes |
| `services/exam_service` + `api/v1/exams.py` | 真题测试：卷库、尝试生命周期、服务端判分、每日一练。UI 在 `app/(main)/practice/exams/*` 与 `/practice/daily`——`practice` 是路由，`exams` 不是 |
| `services/practice_service` + `study_session_service` | 词库自适应练习 + 训练轮次 / 每日配额 / 加练（DEC-053） |
| `services/difficulty_service` + `video_classification` | 视频难度与主题：字幕词级标注推导难度 + LLM 主题标签与 CEFR 分类 |
| `services/search_service` + `behavior_service` + `weekly_report_service` | 视频/字幕搜索；`behavior_events` 行为采集喂推荐与评分；学习周报（D9）聚合 |
| `services/video_like_service` + `subtitle_metrics_service` + `youtube_cookies_service` + `alert_service` | 点赞与自动精选；字幕派生语音指标（语速/词汇密度）；管理员一键 seed 的 YouTube cookies 探测与刷新；外部告警通道（E4） |
| `services/unlock_service` | Free-tier access rules: login wall + unlock quotas (quota path retired for 内测期, endpoints answer allow/empty) |
| `services/payment_provider` + `alipay/wechat/mock` | Multi-provider payment, factory pattern (disabled for ICP compliance; redemption code is the only channel) |
| `services/learning_event_service` + `profile_service` + `milestone_service` | Non-blocking LearningEvent emission + profile aggregation (streak / mastery / milestones) |
| `services/recommendation_service` + `scoring_service` + `ranking_service` | Video `learning_score` (7-factor + bonus), recommendation feed, rankings |
| `services/shadowing_service` | Shadowing recording persistence + LearningEvent (ADR-0013; no AI scoring) |
| `services/notification_service` | Cross-cutting: DB write + best-effort WebSocket push + actor-aware dedup |
| `services/video_access.py` + `video_cache.py` | Media gating and cache invalidation (see `knowledge/wiki/problems/cache-invalidation-and-media-gate-blindspots.md`) |
| `tasks/video_processing` | Head/GPU/Tail pipeline + checkpoint resume + watchdog + `prewarm_notes` |
| `tasks/scoring_tasks` + `ranking_tasks` | `learning_score` (hourly top + daily full) + daily ranking snapshots |
| `tasks/order_tasks` + `redeem_tasks` | Order expiry beat + async redemption (the Pro-downgrade beat is parked, not removed) |
| `tasks/reminder_tasks` + `report_tasks` | Vocabulary reminders (hourly, per user timezone) + weekly reports (the Pro-expiry reminder beat is parked) |
| `core/*` | Config, database, redis, security, errors, cache, limiter, logging |
| `frontend/src/app/(main)/*` | User-facing pages: home / browse / channels / watch / search / vocabulary / practice (`daily`, `exams`) / rankings / history / favorites / weekly-report / notifications / profile. 已退役的 Pro 页（`checkout` / `pricing` / `redeem`）只剩 `redirect("/")` 存根 |
| `frontend/src/app/(admin)/*` | Admin panel: videos / users / stats / invites / orders / channels |
| `frontend/src/stores/*` | 6 Zustand stores: auth, adminAuth, profile, watch, vocabulary, plan (plan is profile-only now) |
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
2. **Vocabulary loop**: watch → click word → gloss lookup (ECDICT + past-paper sentences + pre-generated AI notes, no live LLM) → 词库 or vocab set → 今日训练 / 快速过筛. 内测期 main path: 加入学习 → 视频集合 → 快速过筛 → 闭环
3. **Redemption**: input code → row lock (`with_for_update`) → plan=pro + extend 30 days → atomic. Retired for 内测期 (`/redeem` redirects; endpoints and tables dormant)

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

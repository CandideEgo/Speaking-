# System Map

## Module Overview

| Module | Responsibility |
|--------|---------------|
| `api/v1/*` | REST route handlers, thin layer delegating to services |
| `services/video_*` | Video CRUD, seeding, caching（用户 UGC 相关已删，f855613） |
| `services/catalog_service` + `api/v1/catalog` | 候选池（ADR-0017）：抓取导入 + fit_score 排序 + 逐条 promote 复用 seed_video 管线 |
| `services/transcription/*` | WhisperX transcription + wav2vec2 alignment + **hallucination detection** |
| `services/translation/*` | Pluggable translation engine（当前 custom=ark-code-latest，ADR-0018）+ **exponential backoff retry** + **quality gate** |
| `services/ai_service` | Central AI singleton — **运行时仅视频处理管线调用**（词注释预热 generate_word_notes_bulk）；残留死方法见 context.md Cut Features |
| `services/vocabulary_service` + `sr_service` | SM-2 spaced repetition（`enrich_vocabulary_word` 仅 dormant 端点 `GET /vocabulary/{id}/enrich` 触发，无前端入口） |
| `services/ecdict` + `exam_corpus` + `word_notes` | 点词 gloss 三来源：本地考试词标注（无 AI）+ 真题例句 + 预生成 AI 词注释（管线预热，无实时 LLM） |
| `services/payment_provider` + `alipay/wechat/mock` | Multi-provider payment with factory pattern（**ICP 合规禁用**，仅兑换码渠道） |
| `services/learning_event_service` + `profile_service` + `milestone_service` | LearningEvent 发射（非阻塞）+ 学习档案聚合（streak/mastery/里程碑）。**学习计划服务已删（f855613）** |
| `services/recommendation_service` + `scoring_service` | Video learning_score (7-factor + bonus), recommendation feed |
| `services/shadowing_service` | 跟读录音持久化 + LearningEvent (ADR-0013; 无 AI 评分) |
| `services/notification_service` | Cross-cutting: DB write + WebSocket push (best-effort) + actor-aware dedup |
| `tasks/video_processing` | Head/GPU/Tail pipeline + checkpoint resume + watchdog + prewarm_notes |
| `tasks/order_tasks` + `redeem_tasks` | Order expiry beat + redemption async + pro downgrade |
| `tasks/scoring_tasks` | Video learning_score computation (hourly top + daily full) |
| `tasks/reminder_tasks` + `weekly_report_tasks` | 词汇提醒（每小时按用户时区）+ Pro 到期提醒 + 周报生成 |
| `core/*` | Config, database, redis, security, errors, cache, limiter, logging |
| `frontend/src/app/(main)/*` | User-facing pages: watch/browse/vocabulary/history |
| `frontend/src/app/(admin)/*` | Admin panel: videos/users/stats/invites/orders/channels |
| `frontend/src/stores/*` | 6 Zustand stores: auth, adminAuth, feed, watch, vocabulary, plan（planStore 仅剩 profile） |
| `frontend/src/lib/api.ts` | API client with JWT auto-refresh |

## Dependencies — Non-obvious

```
ai_service ←── video pipeline (finalize: translation via services/translation + prewarm notes)
            ←── vocabulary_service (enrich — dormant, 无前端入口)

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
2. **Vocabulary loop**: Watch video → click word → **gloss 查库**（ECDICT + 真题例句 + 预生成 AI 注释，无实时 LLM）→ vocabulary book → SM-2 review (ease_factor/interval schedule)
3. **Redemption**: Input code → row lock (`with_for_update`) → plan=pro + extend 30 days → atomic

## External Boundaries

| Boundary | Protocol | Notes |
|----------|----------|-------|
| Agnes AI Gateway | OpenAI-compatible HTTP | Central AI for translate/enrich/rubric/quiz/prewarm |
| Alibaba Cloud OSS | Signed URLs | Media storage, GPU worker gets signed URL (no direct credentials) |
| PostgreSQL | SQLAlchemy async | Primary data store |
| Redis | Direct client | Cache/lock/queue/rate-limit/blacklist/progress — all fail-open |
| yt-dlp | CLI subprocess | Video download + metadata extraction |
| ffmpeg | CLI subprocess | Video transcoding (480/720/1080p) |
| WhisperX | Local GPU model | Transcription + forced alignment |
| Alipay/WeChat | HTTP callback | Payment callbacks (currently disabled for ICP compliance) |

## Key Invariants

- GPU worker MUST NOT access DB or OSS credentials — security boundary enforced by env config, not hard isolation
- All Redis dependencies MUST fail-open — never block on Redis unavailability
- Video processing is admin/catalog-triggered only — 用户面无提交入口（用户 UGC 已删 f855613）
- Tailwind v4 is CSS-first — MUST NOT create tailwind.config.js
- AI calls MUST go through `ai_service.py` / `services/translation/*`, never AsyncOpenAI directly in routes；**运行时 AI 调用仅发生在视频处理管线**（gloss 等用户路径无实时 LLM）
- Payment is ICP-compliant disabled — redemption code is the only channel
- `with_for_update` row locks required for redemption and payment atomicity
- Notification dedup is non-atomic (check-then-insert) — acceptable trade-off: low-stakes data, avoids contention on high-write table
- **Transcription quality**: hallucination detection runs at callback time; FAIL marks video error, stopping the pipeline
- **Translation quality**: quality gate runs after batch translation; WARN logs issues but continues (transient API failures may resolve on retry)
- **Word_levels preservation**: re-running finalize_video only computes when `word_levels is None`, preserving manual overrides

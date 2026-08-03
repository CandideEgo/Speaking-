# System Map

## Module Overview

| Module | Responsibility |
|--------|---------------|
| `api/v1/*` | REST route handlers, thin layer delegating to services |
| `services/video_*` | Video CRUD, seeding, review, upload, caching |
| `services/transcription/*` | WhisperX transcription + wav2vec2 alignment + **hallucination detection** |
| `services/translation/*` | Pluggable translation (qwen default + hy_mt2 concurrent fallback; agnes/glm/custom optional) + **exponential backoff retry** + **quality gate** |
| `services/ai_service` | Central AI singleton — translate/enrich/rubric/quiz/prewarm, shared by 6+ callers |
| `services/vocabulary_service` + `sr_service` | SM-2 spaced repetition + word enrichment |
| `services/ecdict` + `exam_corpus` | Local exam-level annotation (CET4/6/gaokao), no AI |
| `services/payment_provider` + `alipay/wechat/mock` | Multi-provider payment with factory pattern |
| `services/learning_plan_service` + `learning_event_service` + `profile_service` | ADR-0012 learning plan: rule engine, event emission, profile aggregation |
| `services/ai_plan_service` | AI-powered plan generation (Pro, LLM JSON schema) |
| `services/recommendation_service` + `scoring_service` | Video learning_score (6-factor), recommendation feed |
| `services/milestone_service` | Learning milestone tracking |
| `services/comment_service` | Video comment quality scoring (keyword-based) |
| `services/notification_service` | Cross-cutting: DB write + WebSocket push (best-effort) + actor-aware dedup |
| `tasks/video_processing` | Head/GPU/Tail pipeline + checkpoint resume + watchdog |
| `tasks/order_tasks` + `redeem_tasks` | Order expiry beat + redemption async + pro downgrade |
| `tasks/scoring_tasks` | Video learning_score computation (hourly top + daily full) |
| `tasks/plan_tasks` | Async AI plan generation (Celery) |
| `core/*` | Config, database, redis, security, errors, cache, limiter, logging |
| `frontend/src/app/(main)/*` | User-facing pages: watch/browse/vocabulary/history |
| `frontend/src/app/(admin)/*` | Admin panel: videos/users/stats/invites |
| `frontend/src/stores/*` | 6 Zustand stores: auth, adminAuth, feed, watch, vocabulary, plan |
| `frontend/src/lib/api.ts` | API client with JWT auto-refresh |

## Dependencies — Non-obvious

```
ai_service ←── video pipeline (prewarm)
            ←── vocabulary_service (enrich/quiz)
            ←── practice_service (quiz)
            ←── ai route (chat)
            ←── words route (lookup)
            ←── ai_plan_service (ADR-0012 AI plan generation)

transcription/whisper_model ←── video pipeline (GPU worker)

notification_service ←── payment callbacks
                     ←── invite/redeem
                     ←── comment_service
                     (actor-aware dedup: same actor → update, different actors → separate)

video_processing (finalize) → writes review_status=published directly
                            ≠ video_review_service.approve_review
                            (two publish paths, inconsistent fields)
```

## Data Flow — Critical Paths

1. **Video pipeline**: URL → dedup → Head(extract+stage+enqueue) → GPU(WhisperX→HTTP callback) → Tail(translate+annotate+prewarm+download+transcode) → ready
2. **Vocabulary loop**: Watch video → click word → AI enrich (Pro) → vocabulary book → SM-2 review (ease_factor/interval schedule)
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
- UGC videos MUST go through admin review before community feed — **enforced**: auto_publish only fires when `video.auto_publish and video.is_official`; UGC videos have `auto_publish=False`
- Tailwind v4 is CSS-first — MUST NOT create tailwind.config.js
- AI calls MUST go through `ai_service.py`, never AsyncOpenAI directly in routes
- Payment is ICP-compliant disabled — redemption code is the only channel
- `with_for_update` row locks required for redemption and payment atomicity
- Notification dedup is non-atomic (check-then-insert) — acceptable trade-off: low-stakes data, avoids contention on high-write table
- **Transcription quality**: hallucination detection runs at callback time; FAIL marks video error, stopping the pipeline
- **Translation quality**: quality gate runs after batch translation; WARN logs issues but continues (transient API failures may resolve on retry)
- **Word_levels preservation**: re-running finalize_video only computes when `word_levels is None`, preserving manual overrides

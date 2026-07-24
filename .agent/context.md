# Project Context

## Purpose

AI-powered English vocabulary learning app (brand: **SeeWord**) for Chinese learners. Users paste video URLs (YouTube/Bilibili), the system generates bilingual subtitles via WhisperX, annotates exam-level vocabulary (CET/gaokao) via ECDICT, and drives SM-2 spaced repetition review. Speaking recording is playback-only (no AI scoring — ADR-0002).

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

Key patterns: Fail-open Redis. Lazy initialization. Celery async bridge (`run_async()`). Pluggable translation engine. Dual auth sessions. Actor-aware notification dedup (same actor → update, different actors → separate notifications). **Video media served from HK VPS** (source station nginx proxies `/media/` → HK VPS nginx static files, not through Python Range service).

For pipeline details, see wiki/architecture/video-pipeline.md.
For service layer details, see wiki/architecture/backend-services.md.

## Important Flows

1. **Video processing**: submit URL → dedup → Head/GPU/Tail → checkpoint resume → ready
2. **Vocabulary learning**: watch video → click word → AI lookup (Pro) → vocabulary book → SM-2 review
3. **Redemption code**: input code → row lock → plan=pro + extend 30 days → atomic
4. **Learning plan loop (ADR-0012)**: generate daily plan (rule/AI) → execute plan items (watch/review/practice) → emit LearningEvent → update profile (streak/goal/mastery) → adjust next plan

## Important Constraints

- GPU Worker must not have DB access or OSS credentials — security boundary
- Redis must not be single point of failure — all Redis dependencies must fail-open
- Tailwind v4 is CSS-first — must not create tailwind.config.js
- New components must use semantic tokens, not hardcoded color values
- UGC videos must not be auto-processed — admin-triggered only (ADR-0004)
- Payment disabled (ICP compliance) — redemption code channel only
- Video media files stored on HK VPS (`/data/seeword_media/`), not source station — source nginx proxies `/media/` to HK VPS; new videos need manual SCP until automated
- For image handling in agent sessions, see wiki/problems/image-handling.md
- LearningEvent emission must be non-blocking (try/except, logged but never raised) — must not disrupt existing service flows (practice submission, video completion, vocabulary review)
- LearningEvent is distinct from BehaviorEvent — different query patterns (daily aggregation vs analytics), different retention, different nullability (LearningEvent always has user_id)

## Known Issues

- `InviteCode` → renamed to `RedeemCode` — DONE
- docs/architecture/SYSTEM-MAP.md is explicitly marked outdated — `.agent/system-map.md` is the authoritative version
- E2E test coverage is the only incomplete completion criteria item
- Notification dedup is non-atomic (check-then-insert) — acceptable for low-stakes notifications, but rare concurrent duplicates possible
- User model dead columns `streak_count`/`longest_streak` replaced by `UserLearningProfile.current_streak`/`longest_streak` (ADR-0012)
- ~~Transcription hallucinations silently enter production~~ → **FIXED** (Phase 2: quality check fails fast on callback)
- ~~Translation API failures cause partial subtitle sets~~ → **FIXED** (Phase 2: exponential backoff retry + per-item fallback)
- ~~Re-running finalize_video overwrites manual word_levels~~ → **FIXED** (Phase 2: compute-on-null only)

## Future Agent Notes

- AI calls must go through `ai_service.py`, never AsyncOpenAI directly in routes
- Dark mode: `.dark` variable block cascades entire site, new components auto-support
- 6 Zustand stores: authStore, adminAuthStore, feedStore (recommendation feed per ADR-0011), watchStore, vocabularyStore, planStore (daily learning plan per ADR-0012)
- authStore and adminAuthStore are separate implementations — no shared factory (createAuthStore was planned but not implemented, reference removed from code)
- Error handling unified through `core/errors.py`, frontend reads `err.code`
- ECDICT database ~30MB, downloaded via scripts, in `.gitignore`
- Beat tasks: expire-pending-orders every 5 min, watchdog-stale-transcriptions every 10 min
- Notification model has composite index `ix_notifications_dedup` on (user_id, type, related_url, is_read) for dedup queries

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

## Domain Terms

### 视频模型

| 术语 | 含义 | 注意 |
|------|------|------|
| **Official 视频** | 管理员 seed 的官方视频（`is_official=True`），出现在首页/browse | |
| **UGC 视频** | `is_official=False` 的视频；用户面 UGC 上传已砍（ADR-0012），列保留 dormant | |
| **标准版 (Standard Version)** | 某 `source_url` 首个处理至 `ready` 的视频，作为该 URL 共享编辑起点 | 与 `is_official` 正交；UGC 亦可成标准版 |
| **Fork（副本）** | 从标准版复制一份独立 Video 行（字幕+练习题快照），直接 ready、不触发 GPU | `forked_from` 记溯源 |
| **提议回写 (Propose-back)** | fork 持有者向标准版提 PR（按批字幕修改）；管理员审/合/驳 | 合并后按行传播到未动该行的 fork |
| **VideoStatus** | `pending_processing → processing → ready_subtitles → ready / error` | 处理状态机 |
| **VideoReviewStatus** | `draft → pending_review → published / rejected` | 审核状态机，UGC 必走 |

### 管线

| 术语 | 含义 |
|------|------|
| **process_video (head)** | 云端 worker：提取元数据 → OSS 暂存 → 入队 GPU 转录 |
| **transcribe_video_gpu** | GPU worker：WhisperX 转录（无 DB、无 OSS 凭证）→ HTTP callback 回云端 |
| **finalize_video (tail)** | 云端 worker：翻译 → 考试词汇标注 → AI 词注释预热 → 下载转码 → 标记 ready |
| **断点续传** | Redis `video:steps:{id}` 记录已完成步骤，重入时跳过 |

### 学习

| 术语 | 含义 |
|------|------|
| **SM-2 词汇复习** | 间隔重复算法，词汇模块核心 |
| **考试词汇标注** | ECDICT 本地标注（CET4/6、gaokao 等），按用户 `target_exam_level` 过滤高亮 |
| **AI 词注释预热** | `finalize_video` 中批量调 LLM 生成词注释，支持双引擎（agnes + glm）并发 |
| **SpeakingAttempt 表（冻结）** | 历史口语评分记录，停止新写入，保留只读 |
| **LearningEvent** | 结构化学习事件（completed_video/learned_words/practiced_items/reviewed_words），与 BehaviorEvent 分离，喂档案聚合+日目标+推荐 |
| **LearningPlan** | 日计划缓存，规则引擎优先级：到期复习→继续观看→新视频→练习→词汇练习。AI 生成 Pro 专属 |
| **UserLearningProfile** | 用户学习档案（streak, mastery_by_level, daily counters），增量更新 via LearningEvent |
| **周循环** | 北极星指标：一天内有 4 种事件类型（watch+vocab+practice+review）= 1 完整闭环 |

### 会员与兑换

| 术语 | 含义 |
|------|------|
| **PlanType** | `free` / `pro` 两档（无月/年之分）。Pro 靠 `plan_expires_at` 控到期 |
| **Pro 会员** | ¥9.9/月，30 天/码，可叠加续期（多码顺延）。无在线支付，走兑换码 |
| **兑换码 (RedeemCode)** | 4 态状态机：`unused → redeemed / revoked / expired`。一张码 = 30 天 Pro |
| **核销** | 用户在 `/redeem` 输入码 → `plan=pro` + `plan_expires_at` 顺延 30 天。`with_for_update` 行锁防并发 |
| **退款撤销** | 管理员对已核销码触发：码置 `revoked(reason=refund)` + 从 `plan_expires_at` 扣 30 天 + 若到期则降 `free`。原子事务，全额追回 |
| **到期主动降级** | beat 任务把 `plan_expires_at < now` 的用户 `plan` 置 `free` |

### 前端

| 术语 | 含义 |
|------|------|
| **统一组件库** | 以 watch 页为风格锚点，保持 coral/cream/brand 色系 |
| **mediaUrl** | `api.ts` 的媒体 URL 解析 helper：相对路径→`${API_URL}${path}` |
| **落地页** | `/landing`，营销页，接为公开首页（未登录 `/` → 落地页） |
| **双 Auth 会话** | 用户端 `seeword_token` vs 管理端 `seeword_admin_*`，独立 localStorage |

### 推荐（ADR-0011，规划中）

| 术语 | 含义 |
|------|------|
| **learning_score** | 视频 0-100 质量分，6 因子加权（CTR/Retention/WatchTime/TopicMatch/Quality/Bonus） |
| **行为采集** | `behavior_events` 表 + 前端埋点，P0 阻塞项 |
| **推荐流** | 40/30/20/10 策略（高分/潜力/冷启动/长视频），替代 `created_at desc` |

## Cut Features（勿再引入）

- **AI 口语评分**：`speaking_service.py`、`rubrics.py`、`speaking_alignment.py` 已删（ADR-0002）
- **跟读/Shadowing 模式**：watch 页"跟读"标签 + 首页 chip 已移除（ADR-0002）
- **口语 streak/目标/统计**：dashboard 口语指标已移除（ADR-0003）
- **用户面 UGC**：已砍（ADR-0012）；Video.is_official / auto_publish 列保留 dormant；ADR-0004 事实失效

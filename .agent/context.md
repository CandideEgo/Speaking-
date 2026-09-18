# Project Context

## Purpose

AI-powered English vocabulary learning app (brand: **SeeWord**) for Chinese learners. Official videos (admin-seeded or catalog-promoted, **用户面不再接受提交 URL**) get bilingual subtitles via WhisperX, exam-level vocabulary annotation (CET/gaokao) via ECDICT, and **pre-generated AI word notes**（管线预热写 `word_ai_notes` 表，点词查库、无实时 LLM 兜底）. Learners click words for an instant gloss (ECDICT + 真题例句 + pre-generated notes), save to a vocabulary book with SM-2 spaced repetition, practice 真题（past papers + 错题本）, 跟读（Shadowing，录音持久化、owner-only JWT 回放、无 AI 评分 per ADR-0002/0013）, and accumulate a learning profile (streak / milestones / mastery-by-level).

**AI 只在视频处理管线实时调用**（翻译 + 词注释预热；见 `tasks/video_processing.py`）。点词、复习、练习、档案聚合均无实时 LLM。会员体系（D0 解锁制：Free 月 3 解锁额度 / Pro 兑换码）仍在；**AI 学习计划、每日学习计划、AI 助手、评论、用户面 UGC 已下线（f855613 / D0b 清理，详见 Cut Features）**。

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

Key patterns: Fail-open Redis. Lazy initialization. Celery async bridge (`run_async()`). Pluggable translation engine. Dual auth sessions. Actor-aware notification dedup (same actor → update, different actors → separate notifications). **Video media served from the backend's local media volume** (repo truth: `nginx.ssl.conf` proxies `/media/` → backend container, range-aware `api/v1/media.py`; external thumbnails localized at ingest since 2026-08, see `docs/operations/MEDIA-TOPOLOGY.md`). The earlier "media lives on HK VPS" claim was never backed by any in-repo config.

For pipeline details, see wiki/architecture/video-pipeline.md.
For service layer details, see wiki/architecture/backend-services.md.

## Important Flows

1. **Video processing**: admin seed / catalog promote → dedup → Head/GPU/Tail → checkpoint resume → ready（含 prewarm_notes 步骤批量生成 AI 词注释）
2. **Vocabulary learning**: watch video → click word → **gloss 端点查库**（ECDICT + 真题例句 + 预生成 AI 注释，无实时 LLM）→ vocabulary book → SM-2 review
3. **Redemption code**: input code → row lock → plan=pro + extend 30 days → atomic
4. **Learning profile aggregation**: 学习行为（完成视频/学词/练习/复习/跟读）→ LearningEvent → 聚合 streak / 里程碑 / 掌握度（`/plan/profile`、`/plan/milestones`、`/plan/mastery-trend`）。**每日学习计划（plan/today 等）已下线（410）**

## Important Constraints

- GPU Worker must not have DB access or OSS credentials — security boundary
- Redis must not be single point of failure — all Redis dependencies must fail-open
- Tailwind v4 is CSS-first — must not create tailwind.config.js
- New components must use semantic tokens, not hardcoded color values
- Video processing is **admin/catalog-triggered only** — 用户面无提交入口（用户 UGC 与提交 URL 已删，f855613）；GPU 成本由运营节奏决定
- AI 词注释**无实时 LLM 兜底**：gloss 只读预生成库，cache miss 返回空字段（`api/v1/words.py`）；唯一实时 AI 调用在视频处理管线（翻译 + prewarm）
- Payment disabled (ICP compliance) — redemption code channel only
- Video media files live in the backend's local media volume (`LOCAL_MEDIA_PATH`, served by the range-aware `/media` router); covers are localized at ingest (`thumbnail_service`) so rendering never depends on external CDNs. Any server-side HK VPS proxying would be out-of-repo config — verify with the MEDIA-TOPOLOGY runbook before assuming it
- For image handling in agent sessions, see wiki/problems/image-handling.md
- LearningEvent emission must be non-blocking (try/except, logged but never raised) — must not disrupt existing service flows (practice submission, video completion, vocabulary review)
- LearningEvent is distinct from BehaviorEvent — different query patterns (daily aggregation vs analytics), different retention, different nullability (LearningEvent always has user_id)

## Known Issues

- docs/architecture/ 旧架构文档已删（漂移），架构知识以 `.agent/system-map.md` + `wiki/` 为权威（见 docs/progress/DEV-LOG-2026-08.md）
- **`.agent` 文档曾滞后于 f855613（D0b 清理）**：2026-09-18 已同步 context/system-map/state/decisions；若再遇文档与代码矛盾，以代码 + `handover-d0b.md` 为准
- E2E test coverage 不完整（CI 有 seed 的核心旅程；播放/词汇/考试等关键流程 e2e 仍缺失）
- Notification dedup is non-atomic (check-then-insert) — acceptable for low-stakes notifications, but rare concurrent duplicates possible
- User model dead columns `streak_count`/`longest_streak` replaced by `UserLearningProfile.current_streak`/`longest_streak` (ADR-0012)
- `ai_service.py` 残留死方法 + `GET /vocabulary/{id}/enrich` 无前端入口（Cut Features 已列）
- ~~Transcription hallucinations silently enter production~~ → **FIXED** (Phase 2: quality check fails fast on callback)
- ~~Translation API failures cause partial subtitle sets~~ → **FIXED** (Phase 2: exponential backoff retry + per-item fallback)
- ~~Re-running finalize_video overwrites manual word_levels~~ → **FIXED** (Phase 2: compute-on-null only)

## Future Agent Notes

- AI calls must go through `ai_service.py`（或 `services/translation/*`），never AsyncOpenAI directly in routes；**运行时 AI 调用仅发生在视频处理管线**
- Dark mode: `.dark` variable block cascades entire site, new components auto-support
- 6 Zustand stores: authStore, adminAuthStore, feedStore (recommendation feed per ADR-0011), watchStore, vocabularyStore, planStore (**仅剩 profile 状态**：fetchProfile/refreshProfile，每日计划语义已删 f855613)
- authStore and adminAuthStore are separate implementations — no shared factory (createAuthStore was planned but not implemented, reference removed from code)
- Error handling unified through `core/errors.py`, frontend reads `err.code`
- ECDICT database: 下载包 ~30MB，落盘 SQLite ~0.8GB（backend/data/ecdict.db），.gitignore 已忽略
- Beat tasks: expire-pending-orders (5min), reconcile-pending-orders (15min), watchdog-stale-pipeline (10min), retry-failed-downloads (daily), score-videos-hourly, score-videos-daily, downgrade-expired-pro (hourly), expire-unused-redeem-codes (daily), send-hourly-reminders (hourly), send-pro-expiring-reminders (daily 01:00), generate-weekly-reports (Mon 00:00 UTC)
- Notification model has composite index `ix_notifications_dedup` on (user_id, type, related_url, is_read) for dedup queries

## Key Files

| File | Role |
|------|------|
| `docs/progress/DEV-LOG-2026-08.md` | 文档整理归档日志（旧 PRD/旧计划/漂移文档的归档索引） |
| `docs/adr/` | Architecture Decision Records |
| `docs/progress/PROGRESS.md` | Development progress tracking |
| `CONTRIBUTING.md` | Contribution guide + code standards |
| `backend/app/core/config.py` | Pydantic BaseSettings (~60 env vars) |
| `backend/app/tasks/video_processing.py` | Video pipeline head/tail（含 prewarm_notes 步骤） |
| `backend/app/api/dependencies.py` | Auth deps |
| `backend/app/services/ai_service.py` | Central AI wrapper（**运行时仅管线调用**；残留死方法见 Cut Features） |
| `backend/app/services/word_notes.py` | 预生成 AI 词注释读写（prewarm/get_best_note） |
| `backend/app/api/v1/words.py` | **点词 gloss 端点**（ECDICT + 真题例句 + 预生成注释，无实时 LLM） |
| `backend/app/api/v1/learning_plan.py` | **已删端点返回 410**；保留 profile/milestones/mastery-trend |
| `.agent/handover-d0b.md` | D0b 清理（f855613）交接文档：删除/保留清单的权威记录 |
| `frontend/src/lib/api.ts` | API client with JWT auto-refresh |
| `frontend/src/stores/` | Zustand stores |
| `frontend/src/types/index.ts` | All TypeScript interfaces |

## Domain Terms

### 视频模型

| 术语 | 含义 | 注意 |
|------|------|------|
| **Official 视频** | 管理员 seed / catalog promote 的官方视频（`is_official=True`），出现在首页/browse | |
| **UGC 视频** | **已下线（f855613 / D0b 清理）**：用户面 UGC 上传、提交 URL 全部删除；`is_official=False` 相关列保留 dormant | |
| **标准版 / Fork / 提议回写** | **已下线**（proposal_service 删除，f855613）；`forked_from` 列保留 dormant，勿再引入 | |
| **VideoStatus** | `pending_processing → processing → ready_subtitles → ready / error` | 处理状态机 |
| **VideoReviewStatus** | **已下线**（UGC 审核语义，f855613）；admin review 端点保留 dormant | |
| **Channel（频道）** | 官方策展频道（`channels` 表，ADR-0014）：管理员维护排序/封面/简介/显隐；`videos.channel_ref` 归属（SET NULL）。与抓取的 `channel_id/channel_name` 分离：后者是上游元数据，经 `upstream_channel_id` 登记后 ingest 自动挂接。与 category/tag 主题维度正交 |
| **Catalog（候选池）** | 抓取发现的视频候选暂存区（`catalog_items` 表，ADR-0017），与 `videos` 解耦。管理员按 `fit_score` 排序 + 频道筛选，逐条 `promote` 复用 `seed_video` 完整管线「处理一个上线一个」；`status` new/queued/processing/published/skipped/error，`promoted_video_id` 关联生成的 Video。数据源：Language Reactor 公开目录 API |
| **封面本地化** | 2026-08 起：入库时 `thumbnail_service` 把外部封面下载到 `media/{id}_thumb{ext}`，存量用 `scripts/backfill_local_thumbnails.py` 回填；渲染不再依赖 `/media/proxy` 出口（见 docs/operations/MEDIA-TOPOLOGY.md） |

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
| **AI 词注释预热** | `finalize_video` 中批量调 LLM 生成词注释写入 `word_ai_notes` 表（video 级 + global 级）；**点词只读库，无实时 LLM 兜底**（`api/v1/words.py`） |
| **SpeakingAttempt 表（冻结）** | 历史口语评分记录，停止新写入，保留只读（ADR-0002） |
| **ShadowingAttempt** | 活跃的跟读录音记录（`shadowing_attempts` 表，ADR-0013）：每条录音持久化到 `media/shadowing/{user_id}/`，owner-only JWT 鉴权回放；写 LearningEvent(`shadowed_sentences`) + 档案计数 |
| **LearningEvent** | 结构化学习事件（completed_video/learned_words/practiced_items/reviewed_words/shadowed_sentences），与 BehaviorEvent 分离，喂档案聚合 + 推荐（日目标追踪已随计划下线） |
| **LearningPlan / LearningPlanItem** | **已下线（f855613）**：表保留 dormant，无服务无端点；勿再引入 |
| **UserLearningProfile** | 用户学习档案（streak, mastery_by_level, milestones），增量更新 via LearningEvent；**无 daily plan/goal 语义**（today_* 列 dormant） |
| **周循环** | 原北极星指标（4 种事件类型 = 完整闭环）**已随计划下线**；里程碑/streak 保留 |
| **错题本（真题）** | exam_answers 派生查询（不另建表）：最近一次已作答仍错才在错题本，重做答对即销账；`wrong_redo` 会话模式承载「只练错题/重做全部」 |

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
| **公开路由（访问矩阵）** | `frontend/src/proxy.ts` PUBLIC_PATHS：`/login /register /forgot-password /terms /privacy /contact`（+ admin 登录）。**落地页已删（D0）**，未登录访问受保护路由 → 302 `/login?next=…`；`/pricing` 在登录墙内 |
| **双 Auth 会话** | 用户端 `seeword_token` vs 管理端 `seeword_admin_*`，独立 localStorage |

### 推荐（ADR-0011，P1 评分 + 推荐 feed 已落地）

| 术语 | 含义 |
|------|------|
| **learning_score** | 视频 0-100 质量分，7 因子加权 + bonus（阶段 2 后：CTR .25/Retention .22/WatchTime .18/TopicMatch .12/Quality .08/Viral .08/Freshness .07）；scoring_tasks 每小时 Top200 + 每日全量 |
| **行为采集** | `behavior_events` 表 + `behavior_service` 已落地（P0 解除） |
| **推荐流** | `/recommendations/home`（40/30/20/10 策略）+ `/recommendations/category/{tag}` 已实现，前端 feedStore 承接；深度个性化待推进 |
| **外部元数据/语音指标（阶段 1+3）** | Video 新增 yt_video_id/channel_*/upload_date/ext_view_count/ext_like_count/external_meta + wpm/vocabulary_density；采集于 extracting 步骤（external_meta.py），WPM 在 finalize 尾部 compute-on-null；存量已 backfill。阶段 2 已落地：viral（同频道均值对比 log 归一）+ freshness（views_per_day vs benchmark 10k）入 learning_score，无外部数据时两因子为 0（本地视频不互相对扣）。ext_* 是 YouTube 侧计数，与站内 view_count/like_count 严格分离 |

## Cut Features（勿再引入）

- **AI 口语评分**：`speaking_service.py`、`rubrics.py`、`speaking_alignment.py` 已删（ADR-0002）
- **口语 streak/目标/统计**：dashboard 口语指标已移除（ADR-0003）
- **用户面 UGC / 提交 URL / fork-propose-back**：**已彻底删除（f855613 / D0b 清理，2026-08-28）**：`POST /videos`（用户提交）、`upload/fork/propose/begin-edit/submit-review/user-seed*` 端点、`upload_service.py`、`proposal_service.py`、`video_seed_service.seed_ugc_video`、`video_service.list_published_ugc_videos` 全部删除（handover-d0b.md）。Video 的 UGC 列（`forked_from/auto_publish/review_status` 等）保留 dormant。**处理入口只剩 admin seed + catalog promote**
- **AI 学习计划 / 每日学习计划**：**已下线（f855613）**：`ai_plan_service.py`、`learning_plan_service.py`、`plan_tasks.py` 删除；`/plan/today`、`/plan/progress`、`/plan/history`、`/plan/generate/ai`、`/plan/items/{id}/complete` 返回 410。保留 `/plan/profile|refresh|milestones|mastery-trend`
- **AI 助手 / 评论**：**已下线（f855613）**：`api/v1/ai.py`、`api/v1/comments.py`、`comment_service.py`、`comment_analysis.py` 删除
- **词卡实时 AI 释义**：**已下线（f855613）**：gloss 端点不再实时调 LLM，只读预生成 `word_ai_notes`；`ai_service.py` 残留 5 个死方法（grammar_analyze_batch/evaluate_difficulty/generate_quiz/extract_difficulty_words/generate_practice_questions）+ 1 个无前端入口的实时端点 `GET /vocabulary/{id}/enrich`（enrich_vocabulary_word），可清理勿扩展

> 注意：**跟读（Shadowing）不是 Cut Feature** —— 无 AI 评分（ADR-0002 的评分删除仍成立），但录音持久化功能活跃（`ShadowingAttempt` 表 + watch 页录音面板 + 里程碑，见 ADR-0013）。

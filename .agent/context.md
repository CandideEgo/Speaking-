# Project Context

> What this system is, and what its words mean. Read it when a task needs domain context.
> Structure lives in `system-map.md`, rules in `invariants.md`, decision history in
> `decisions-index.md`, current work in `state.md`. The every-session file is `AGENTS.md`.

## Purpose

AI-powered English vocabulary learning app (brand: **SeeWord**) for Chinese learners. Official
videos — admin-seeded or catalog-promoted — get bilingual subtitles via WhisperX, exam-level
vocabulary annotation (CET4/6, gaokao) via ECDICT, and pre-generated AI word notes written to
`word_ai_notes` during the pipeline. Learners click a word for an instant gloss, collect words into
a vocabulary book or a per-video vocab set, review with SM-2 spaced repetition, practise real past
papers (with a wrong-answer book), do shadowing (recording persisted, owner-only replay, no AI
scoring), and accumulate a learning profile (streak / milestones / mastery by level).

**AI is called at runtime only in the video pipeline** (translation + word-note prewarm); gloss,
review, practice and profile aggregation have no live LLM. The membership model is D0 (see
DEC-024), superseded by free access during 内测期 — see `state.md`.

## Important Flows

1. **Video processing**: admin seed / catalog promote → dedup → Head/GPU/Tail → checkpoint resume → ready (includes the `prewarm_notes` step)
2. **Vocabulary learning**: watch → click word → gloss lookup (ECDICT + past-paper sentences + pre-generated AI notes, no live LLM) → 词库 or vocab set → 今日训练 / 快速过筛. The 内测期 main path is 加入学习 → 视频集合 → 快速过筛 → 闭环
3. **Redemption**: code → row lock → plan=pro + extend 30 days → atomic. Retired for 内测期 (`/redeem` redirects; endpoints and tables dormant — see the 会员与兑换 table)
4. **Profile aggregation**: learning actions → LearningEvent → streak / milestones / mastery (`/plan/profile`, `/plan/milestones`, `/plan/mastery-trend`). The daily-plan endpoints answer 410

## Domain Terms

### Video model

| 术语 | 含义 | 注意 |
|------|------|------|
| **Official 视频** | 管理员 seed / catalog promote 的官方视频（`is_official=True`），出现在首页/browse | 唯一的处理入口 |
| **VideoStatus** | `pending_processing → processing → ready_subtitles → ready / error` | 处理状态机 |
| **Channel（频道）** | 官方策展频道（`channels` 表，ADR-0014）：管理员维护排序/封面/简介/显隐；`videos.channel_ref` 归属（SET NULL）。与抓取的 `channel_id/channel_name` 分离——后者是上游元数据，经 `upstream_channel_id` 登记后 ingest 自动挂接。与 category/tag 主题维度正交 | 自动建档走 `ensure_channel_for` |
| **Catalog（候选池）** | 抓取发现的候选暂存区（`catalog_items` 表，ADR-0017），与 `videos` 解耦。按 `fit_score` 排序 + 频道筛选，逐条 `promote` 复用 `seed_video` 完整管线「处理一个上线一个」；`status` new/queued/processing/published/skipped/error | 数据源为 Language Reactor 公开目录 API |
| **封面本地化** | 入库时 `thumbnail_service` 把外部封面下载到 `media/{id}_thumb{ext}`，渲染不再依赖 `/media/proxy` 出口 | 见 `docs/operations/MEDIA-TOPOLOGY.md` |
| **存储三态（storage_mode）** | `local` 本地精品（默认，全功能）/ `proxy` 代理播放（仅占位，未实现）/ `offline` 已下线（隐藏 + 删媒体，学习记录保留） | ADR-0020 |

### 管线

| 术语 | 含义 |
|------|------|
| **process_video (head)** | 云端 worker：提取元数据 → OSS 暂存 → 入队 GPU 转录 |
| **transcribe_video_gpu** | GPU worker：WhisperX 转录（无 DB、无 OSS 凭证）→ HTTP callback 回云端 |
| **finalize_video (tail)** | 云端 worker：翻译 → 考试词汇标注 → AI 词注释预热 → 下载转码 → 标记 ready |
| **断点续传** | Redis `video:steps:{id}` 记录已完成步骤，重入时跳过 |
| **AI 词注释预热** | `finalize_video` 中批量调 LLM 生成词注释写入 `word_ai_notes`（video 级 + global 级） |

### 学习

| 术语 | 含义 |
|------|------|
| **SM-2 词汇复习** | 间隔重复算法，词汇模块核心。内测期「基本复习」保留；`mastered` 词退出复习队列（三态语义：已掌握 = 闭环终点），高级复习算法属 Pro 二期 |
| **词汇集合（VocabSet）** | 用户 × 视频 × 等级 的收词集合（`vocab_sets` + `vocab_set_words`）。集合只**引用**词库词行（`vocabulary_id` FK），掌握态仍归 `Vocabulary`——「集合 = 按视频聚合的视图」，可随时重建。`vocab_set_words.status` 是集合内流程态：`pending` / `known` / `unknown` / `learned` |
| **快速过筛** | 两档自评「会 / 不会」（模糊归不会）。判「会」→ 词库 mastered；判「不会」→ 待学清单。按词粒度服务端保存进度，可随时退出续筛 |
| **今日训练** | 百词斩式两段流（新词闪卡 → 到期测验 → 总结），队列来自 `GET /vocabulary/daily-session`。**口径陷阱**：`due_total` 不含 new 词，`stats.due_count`（徽标红点）含——两处「待复习」数字故意不同 |
| **闭环终点** | 集合 `completed` = **无 pending 且无 unknown**（不是「过筛走完」）。待学清单词经 `POST /vocab-sets/{id}/words/{id}/learned` 标记后触发，发一条 `LearningEvent(learned_words, value=集合总数)` |
| **考试词汇标注** | ECDICT 本地标注（CET4/6、gaokao 等），按用户 `target_exam_level` 过滤高亮 |
| **ShadowingAttempt** | 活跃的跟读录音记录（`shadowing_attempts` 表，ADR-0013）：每条录音持久化到 `media/shadowing/{user_id}/`，owner-only JWT 鉴权回放；写 `LearningEvent(shadowed_sentences)` + 档案计数 |
| **LearningEvent** | 结构化学习事件（completed_video / learned_words / practiced_items / reviewed_words / shadowed_sentences），与 BehaviorEvent 分离，喂档案聚合 + 推荐 |
| **UserLearningProfile** | 用户学习档案（streak, mastery_by_level, milestones），增量更新 via LearningEvent；无 daily plan/goal 语义（`today_*` 列 dormant） |
| **错题本（真题）** | `exam_answers` 派生查询（不另建表）：最近一次已作答仍错才在错题本，重做答对即销账；`wrong_redo` 会话模式承载「只练错题 / 重做全部」 |

### 会员与兑换

| 术语 | 含义 |
|------|------|
| **PlanType** | `free` / `pro` 两档（无月/年之分）。Pro 靠 `plan_expires_at` 控到期 |
| **Pro 会员** | ¥9.9/月，30 天/码，可叠加续期（多码顺延）。无在线支付，走兑换码。**内测期无 Pro 概念，前端入口已全部移除** |
| **兑换码 (RedeemCode)** | 4 态状态机：`unused → redeemed / revoked / expired`。一张码 = 30 天 Pro |
| **核销** | 用户在 `/redeem` 输入码 → `plan=pro` + `plan_expires_at` 顺延 30 天。`with_for_update` 行锁防并发 |
| **退款撤销** | 管理员对已核销码触发：码置 `revoked(reason=refund)` + 扣 30 天 + 若到期则降 `free`。原子事务 |
| **到期主动降级** | beat 任务把 `plan_expires_at < now` 的用户 `plan` 置 `free`（内测期该 beat 已摘调度，任务体保留） |

### 前端

| 术语 | 含义 |
|------|------|
| **统一组件库** | 以 watch 页为风格锚点，保持 coral/cream/brand 色系 |
| **mediaUrl** | `api.ts` 的媒体 URL 解析 helper：相对路径 → `${API_URL}${path}` |
| **公开路由（访问矩阵）** | `frontend/src/proxy.ts` 的 PUBLIC_PATHS 是公开白名单唯一来源；未登录访问受保护路由 → 302 `/login?next=…`；已退役的 Pro 页均 redirect('/') |
| **双 Auth 会话** | 用户端 `seeword_token` vs 管理端 `seeword_admin_*`，独立 localStorage，**两套独立实现** |
| **错误处理** | 统一走 `core/errors.py`，前端读 `err.code` |
| **ECDICT 库** | 下载包 ~30MB，落盘 SQLite ~0.8GB（`backend/data/ecdict.db`，已 gitignore） |

### 推荐（ADR-0011）

| 术语 | 含义 |
|------|------|
| **learning_score** | 视频 0-100 质量分，7 因子加权，因子与权重见 scoring 配置。`scoring_tasks` 每小时 Top200 + 每日全量 |
| **行为采集** | `behavior_events` 表 + `behavior_service`（P0 已解除） |
| **推荐流** | `/recommendations/home`（40/30/20/10 策略）+ `/recommendations/category/{tag}`，前端 `usePlatformFeed` 承接；深度个性化待推进 |
| **外部元数据 / 语音指标** | Video 的 `yt_video_id` / `channel_*` / `upload_date` / `ext_view_count` / `ext_like_count` / `external_meta` + `wpm` / `vocabulary_density`。采集于 extracting 步骤（`external_meta.py`），WPM 在 finalize 尾部 compute-on-null。`viral` + `freshness` 两因子入 `learning_score`，无外部数据时为 0（本地视频不互相对扣）。**`ext_*` 是 YouTube 侧计数，与站内 `view_count` / `like_count` 严格分离** |

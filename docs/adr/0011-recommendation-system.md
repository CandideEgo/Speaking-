# ADR-0011: 视频评分 + 推荐 + 行为采集系统 — 差距分析与分阶段落地

- **Status**: Accepted (long-term blueprint, deferred) — 2026-07-05; reclassified 2026-07-06

## Context

目标架构（8 层）覆盖数据获取 → 视频处理 → 存储 → 评分 → 推荐排序 → 后端服务 → 用户行为 → 前端展示。对现有 Speaking- 代码库的全面调研结果：

### 8 层差距分析矩阵

| 层 | 目标 | 现状 | 就绪度 | 关键差距 |
|---|---|---|---|---|
| 1 数据获取 | YouTube Data API + 频道订阅 + 手动 | yt-dlp + 人工种子 + 用户 URL 提交 | 30% | 无 YouTube Data API、无 Channel 模型、无频道订阅、无增量拉取 |
| 2 视频处理 | 下载→音频→ASR→翻译→后处理 | yt-dlp+FFmpeg+WhisperX+4 引擎翻译+句子分段 | 85% | 无降噪、无关键词提取、无章节切分；元数据深度不足 |
| 3 数据存储 | PG+文件+Redis 三层 | PG(19 模型)+OSS/本地+Redis 缓存 | 60% | 缺 channels/tags/recommendations/video_scores/behavior_events 表；videos 缺 7 个字段；无热门榜 ZSET |
| 4 评分系统 | 6 因子加权 Score | 无任何 score 字段或服务 | 0% | 完全缺失，需新增表+服务+计算任务 |
| 5 推荐排序 | 40/30/20/10 策略 + 多样性 | 仅按 `created_at desc` + 人工 `is_featured` | 2% | 仅 `/assistant/recommend` 返回 LLM 文字建议（不返回视频列表） |
| 6 后端服务 | 微服务拆分 5 个服务 | FastAPI 单体，27 个 service 文件 | 75% | 缺 recommendation_service/analytics_service/behavior_service |
| 7 用户行为 | click/watch/complete/pause/seek 事件流 | LearningRecord 状态快照（可推导 watch_time/completion） | 10% | 无事件流、无 Kafka/Redis Stream、前端 0 埋点、video 元素仅 1 个回调 |
| 8 前端展示 | 推荐流+分类+播放+学习模式+用户中心 | App Router 完整，字幕/翻译/查词/跟读齐全 | 70% | 分类体系不符(无 AI/编程/语言)、无"我的收藏"页、首页是精选列表非推荐流、行为采集 0% |

### 核心调研发现

- **层 4-5-7 整体空白度约 95%**：33 个迁移文件无任何 score 字段；无 `/recommendations` 端点（仅 `/ai/assistant/recommend` 返回单条 LLM 文字建议，非视频列表）；无 pgvector / embedding 代码；无 behavior_events 表；无 Kafka / Redis Stream 消费者；所有列表端点（`/videos/public`、`/browse/feed`、`/browse/featured`、`/search`）均按 `created_at desc` 排序。
- **可复用资产**：三段式视频流水线（`process_video` → `transcribe_video_gpu` → `finalize_video`）、WhisperX forced alignment、4 引擎翻译、`LearningRecord`（time_spent_seconds/progress_percentage/position_seconds 可作 Retention/WatchTime 信号）、PostgreSQL FTS `search_vector`（可作 TopicMatch 关键词基础）、Redis fail-open 工具（`@cached` 装饰器）、`/browse/feed` 端点骨架、Celery beat 调度、`run_async()` 共享事件循环。
- **阻塞链**：无行为采集 (层7) → 无训练数据 → 推荐算法无样本 (层5) → 推荐无个性化；无 score 字段 (层4) → 列表只能按 created_at 排序。**落地顺序必须是 P0 行为采集 → P1 评分 → P2 推荐**，反向不可行。
- **与既有 ADR 的关系**：本方案不依赖 ADR-0002 已删除的 `speaking_service.py`（口语评分已冻结）；与 ADR-0004 UGC 管线兼容（评分计算挂在 `finalize_video` 末尾，对 UGC/官方视频统一处理）；与 ADR-0006 标准版/Fork 模型正交（评分针对 `Video` 行，标准版与 fork 共享同一 score）。

### 现状评估与启动门槛（2026-07-06 重新定位为远期能力蓝图）

> **本 ADR 现为远期能力蓝图，非待执行计划。** 整体推迟至启动门槛满足后才启动。以下 Decision 的分阶段计划保留作为能力蓝图，不等同于近期开工清单。

**当前规模事实**（核实）：~13 个种子视频 / 未上线（3 CRITICAL 阻塞：邮箱 stub、HTTPS、ICP）/ 日活 0 / 2C1.6G 服务器。推荐系统解决"内容过载下的选择困难"，13 个视频不存在过载——`is_featured` + `show_on_homepage` + `created_at desc` 完全够用，人工精选反而更准。当务之急是上线阻塞，不是推荐系统。

**拆分两个独立决策**：原 ADR 把"行为采集"与"推荐排序"捆绑评估，二者必要性不同——

- **行为采集 = 基础设施**：早做、成本低、数据有独立价值（产品决策 / 内容采购 / 留存分析），不依赖推荐算法。**唯一可在上线后立即启动的部分**，后端可简化：当前规模直接写 PG 表够，不需要 Redis Stream（Stream 为 P4 实时消费准备，现在无消费者，徒增复杂度）。
- **推荐排序 = 产品功能**：晚做、依赖规模与数据。整体推迟。

**各阶段启动门槛**：

| 阶段 | 启动门槛 | 前置条件 |
|---|---|---|
| P0 行为采集 | 上线后 | 无（独立有价值） |
| P1 评分 | 视频数 > 50 + 1 个月行为数据 | 先核实 `LearningRecord.time_spent_seconds` / `progress_percentage` 是否被前端可靠写入（当前存疑；占 45% 权重的 Retention/WatchTime 因子可能无源之水） |
| P2 推荐排序 | P1 跑稳 + 日活 > 200 | P1 评分有效 |
| P3 内容获取 | 国内访问 YouTube 的网络方案确定 | YouTube Data API 配额 + 代理 / 海外节点（云端调用，不同于 GPU 转录可搬到本地） |
| P4 进阶 | 行为事件 > 10 万条 + 数据积累 1 月+ | 2C1.6G 服务器需评估 pgvector 负载 |

## Decision

分 5 个阶段落地。**P0 是阻塞项，必须先单独跑完上线并积累 1-2 周数据再启动 P1**。

### Phase 0：行为采集基础设施（阻塞项）

**目标**：建立端到端行为数据通道，让"用户在做什么"可观测。这是后续所有推荐算法的训练数据来源。

数据模型（一个迁移）：

```sql
behavior_events 表
  id BIGSERIAL PK
  user_id BIGINT NULL          -- 匿名也允许
  video_id BIGINT NULL
  event_type VARCHAR(32)       -- click / play / pause / seek / complete / save / like
  event_payload JSONB          -- {position_s, duration_s, to_s, from_s, ...}
  session_id UUID
  client_ts BIGINT             -- 客户端时间戳
  server_ts TIMESTAMPTZ DEFAULT NOW()
  INDEX (user_id, server_ts)
  INDEX (video_id, event_type)

videos 表新增字段:
  view_count BIGINT DEFAULT 0  -- 独立于 like_count，统计播放完成次数
```

后端：

- 新增 `backend/app/services/behavior_service.py`：`ingest_event()`、`ingest_batch()`（批量入库减压力）
- 新增 `backend/app/api/v1/behavior.py`：`POST /api/v1/behavior/events`（单条）、`POST /api/v1/behavior/events/batch`（批量，前端 flush 用）
- 写入 Redis Stream `behavior:events`（`xadd`），暂不消费——P4 再做消费者
- 同步把 `click`/`complete` 事件镜像更新 `videos.view_count` 和 `LearningRecord`（保持兼容）

前端：

- 新增 `frontend/src/lib/analytics.ts`：`track(eventType, payload)` + 内存队列 + 5 秒 flush + 页面隐藏 `sendBeacon`
- 在 `frontend/src/app/(main)/watch/[id]/page.tsx` 的 `<video>` 元素补 4 个回调：`onPlay` / `onPause` / `onSeeked` / `onEnded`，复用现有 `onTimeUpdate` 已有的时间信息
- 在 `frontend/src/hooks/useVideoPlayer.ts` 加 `watchTimeAccumulator`：每 10 秒上报一次 `watch_time` 增量
- 首页/分类页视频卡点击埋 `click` 事件（带 source: home/category/search）

验收：能从浏览器看到 `POST /behavior/events/batch` 请求；DB `behavior_events` 表有真实数据；`videos.view_count` 在播放完成后 +1。

### Phase 1：视频评分系统（层 4）

**目标**：给每个视频算出一个 0-100 的 `learning_score`，用于列表排序。**先不上 embedding**，用关键词近似 TopicMatch。

数据模型（一个迁移）：

```sql
video_scores 表（一个视频一行）
  video_id BIGINT PK FK
  ctr_score FLOAT           -- 0-1，归一化
  retention_score FLOAT
  watch_time_score FLOAT
  topic_match_score FLOAT
  quality_score FLOAT
  bonus FLOAT
  total_score FLOAT         -- 0-100
  computed_at TIMESTAMPTZ
  INDEX (total_score DESC)

videos 表新增字段:
  score FLOAT DEFAULT 0       -- 冗余最新分，便于查询
  score_updated_at TIMESTAMPTZ
```

评分公式（`backend/app/services/scoring_service.py`）：

| 因子 | 权重 | 数据源（P1 简化版） |
|---|---|---|
| CTR | 0.30 | `(view_count + like_count*5 + favorite_count*3) / max(age_days, 1)` 归一化 |
| Retention | 0.25 | `avg(LearningRecord.progress_percentage)` |
| WatchTime | 0.20 | `avg(LearningRecord.time_spent_seconds) / duration` |
| TopicMatch | 0.15 | 关键词命中 `search_vector @@ target_intent_query`（target 来自用户 `target_exam_level`/兴趣） |
| Quality | 0.10 | `(like_count+favorite_count*2) / max(view_count, 1) + channel_authority`（channel 暂用 is_official 替代） |
| Bonus | +0.10 上限 | 有字幕✓+翻译✓+章节✓+evergreen(topic_tags ∈ {ai,programming,education}) |

任务：

- 新增 Celery 任务 `compute_video_score(video_id)`：单视频算分
- `finalize_video` 末尾调用一次（新视频立刻有分）
- Celery beat 新增 `recompute-scores`：每小时重算 Top 200 视频分（增量）
- beat 新增 `recompute-all-scores`：每天凌晨全量重算

API：`GET /api/v1/videos/{id}/score`（admin/debug）；`videos` 详情返回 `score` 字段。

验收：`SELECT video_id, total_score FROM video_scores ORDER BY total_score DESC LIMIT 20` 返回合理排序；新视频入库 5 分钟内有分数。

### Phase 2：推荐排序（层 5）

**目标**：把首页从"`created_at desc` 精选列表"改造成"基于 score + 用户行为的推荐流"。**仍不上 embedding/协同过滤**，先用内容加权 + 简单多样性。

后端：

- 新增 `backend/app/services/recommendation_service.py`：
  - `get_home_feed(user, page, page_size)`：实现 40/30/20/10 策略
    - 40% 高分：`ORDER BY score DESC` 取 Top N
    - 30% 潜力：score 中段但 `like_count/view_count` 增速快
    - 20% 冷启动：`created_at > now-7d` 且处理完成
    - 10% 长视频：`duration > 1200` 且 score > 阈值
  - 多样性控制：同 `topic_tags` 最多连续 2 条（简单去重）
  - 个性化：已登录用户按 `target_exam_level` 过滤；按其历史 `behavior_events` 中 click 的 `topic_tags` 加权
- 新增 `backend/app/api/v1/recommendations.py`：
  - `GET /api/v1/recommendations/home`（首页流）
  - `GET /api/v1/recommendations/category/{tag}`（分类流）
- Redis 缓存：`recommend:home:{user_id}:{page}` TTL 60s（短缓存，行为变化能快速反映）

前端：

- 改造 `frontend/src/hooks/useHomeFeed.ts`：从 `/browse/featured` 切到 `/recommendations/home`
- `frontend/src/app/(main)/page.tsx` 顶部加"为你推荐"模块
- 新增 `frontend/src/stores/feedStore.ts`：缓存首页流 + 已读去重

验收：首页第一个视频卡是算法推荐而非人工 `is_featured`；切换 `target_exam_level` 后首页内容变化；缓存命中率 > 70%。

### Phase 3：内容获取增强（层 1 + 层 2 后处理）

**目标**：从"手动 12 个种子视频"扩展到"频道订阅自动入库 + 元数据完整 + 章节切分"。可在 P2 之后做，推荐系统不阻塞于此。

数据模型：

```sql
channels 表
  id BIGSERIAL PK
  youtube_channel_id VARCHAR(64) UNIQUE
  name VARCHAR(255)
  handle VARCHAR(255)
  avatar_url TEXT
  subscriber_count INT
  video_count INT
  authority_score FLOAT     -- 用于 Quality 因子
  fetched_at TIMESTAMPTZ
  is_active BOOL DEFAULT TRUE

channel_subscriptions 表（admin 配置，非用户订阅）
  id BIGSERIAL PK
  channel_id BIGINT FK
  target_category VARCHAR(64)  -- ted/ai/programming/...
  enabled BOOL
  last_fetched_at TIMESTAMPTZ
  fetch_interval_minutes INT DEFAULT 360

video_chapters 表
  id BIGSERIAL PK
  video_id BIGINT FK
  start_seconds INT
  end_seconds INT
  title VARCHAR(255)
  index INT

videos 表新增字段:
  channel_id BIGINT FK NULL
  description TEXT
  tags JSONB
  publish_time TIMESTAMPTZ
  youtube_view_count BIGINT
  youtube_like_count BIGINT
  youtube_comment_count BIGINT  -- 与应用内计数区分
```

后端：

- 新增 `backend/app/services/youtube_data_service.py`：封装 YouTube Data API v3（`videos.list` / `channels.list` / `search.list`）
- 新增 `backend/app/services/channel_service.py`：订阅管理 + 增量拉取
- 新增 Celery beat 任务 `fetch-channel-updates`：每 30 分钟轮询启用的订阅
- 改造 `backend/scripts/seed_official_videos.py` 的 `_fetch_metadata()`：把已拉取但未持久化的 `description`/`tags`/`uploader`/`view_count` 等写入 DB
- 章节切分：在 `backend/app/services/transcription/formatters.py` 加 `detect_chapters(segments, duration)`——基于 WhisperX 段落密度 + 长静音检测；同时拉取 YouTube 自带 chapters（`info.chapters`）作为权威来源
- 关键词提取：在 `finalize_video` 加一步 `_extract_keywords()`，用现有 `search_vector` 词频 + AI 批量调用提取 5-10 个关键词存入 `videos.tags`

配置：`backend/app/core/config.py` 新增 `youtube_api_key`、`youtube_api_enabled`、`channel_fetch_interval_minutes`；`backend/requirements.txt` 新增 `google-api-python-client`。

验收：配置一个 TED 频道订阅后，24 小时内自动入库该频道最新 5 个视频，每个视频带 description/tags/channel/publish_time/chapters。

### Phase 4：进阶能力（embedding + 流处理 + 冷启动）

**目标**：把"基于规则的推荐"升级到"基于语义 + 实时行为"的推荐。**仅在 P0-3 数据积累 1 个月以上、行为事件 > 10 万条后再做**。

按价值排序：

1. **Embedding-based TopicMatch**：引入 pgvector + `text-embedding-3-small`，给每个视频的 `title+description+tags` 算 1536 维向量；用户画像向量由其最近 50 个 click 视频向量平均得到；cosine 相似度替换 P1 的关键词 TopicMatch
2. **Redis Stream 消费者**：把 P0 的 `behavior:events` Stream 接上消费者，实时更新 `user_recent_interests`（最近 7 天 topic_tags 权重）+ 实时更新 `videos.view_count`/`hot_score`
3. **实时热门榜**：Redis ZSET `hot:videos:24h`，`zincrby` 在 complete 事件时累加，TTL 24 小时滑动窗口
4. **协同过滤**：基于 `behavior_events` 的 user-video 交互矩阵，离线计算 item-item 相似度（每月跑一次 Celery 任务）
5. **真正的冷启动策略**：新视频前 2 小时用 epsilon-greedy 给 5% 流量曝光，收集 click-through 数据后再纳入正常排序
6. **降噪**：在 `backend/app/services/transcription/audio_extractor.py` 加 `afftdn` 滤镜选项（可配置开关），提升 WhisperX 在嘈杂视频上的准确率

验收：A/B 实验显示推荐流点击率比 P2 提升 ≥ 15%；新视频 24 小时内能获得首次 click 数据。

### 改动汇总

**新增数据模型迁移**：

| 迁移 | 表/字段 | 阶段 |
|---|---|---|
| `add_behavior_events` | `behavior_events` + `videos.view_count` | P0 |
| `add_video_scores` | `video_scores` + `videos.score`/`score_updated_at` | P1 |
| `add_channels_and_chapters` | `channels`/`channel_subscriptions`/`video_chapters` + `videos` 7 字段 | P3 |
| `add_video_embeddings` | `video_embeddings`（pgvector 扩展） | P4 |

**新增后端文件**：

| 文件 | 阶段 |
|---|---|
| `backend/app/services/behavior_service.py` | P0 |
| `backend/app/api/v1/behavior.py` | P0 |
| `backend/app/services/scoring_service.py` | P1 |
| `backend/app/tasks/scoring_tasks.py` | P1 |
| `backend/app/services/recommendation_service.py` | P2 |
| `backend/app/api/v1/recommendations.py` | P2 |
| `backend/app/services/youtube_data_service.py` | P3 |
| `backend/app/services/channel_service.py` | P3 |
| `backend/app/services/embedding_service.py` | P4 |

**修改后端文件**：

| 文件 | 改动 | 阶段 |
|---|---|---|
| `backend/app/main.py` | 注册新路由 | P0-P3 |
| `backend/app/tasks/celery_app.py` | 新增 beat 任务 + 路由 | P1-P3 |
| `backend/app/tasks/video_processing.py` 的 `finalize_video` | 末尾调用 `compute_video_score.delay()` + 章节切分 + 关键词提取 | P1, P3 |
| `backend/app/services/video_service.py` | `list_public_videos` 排序改用 `score desc` | P1 |
| `backend/app/api/v1/browse.py` | `/browse/feed` 加 `sort=score\|trending\|newest` 参数 | P2 |
| `backend/app/core/config.py` | 新增 YouTube API、降噪、embedding 配置 | P3, P4 |
| `backend/requirements.txt` | `google-api-python-client`、`pgvector`、`sentence-transformers`（按阶段） | P3, P4 |

**新增/修改前端文件**：

| 文件 | 改动 | 阶段 |
|---|---|---|
| `frontend/src/lib/analytics.ts` | 新增埋点工具 | P0 |
| `frontend/src/app/(main)/watch/[id]/page.tsx` | `<video>` 补 4 个回调 | P0 |
| `frontend/src/hooks/useVideoPlayer.ts` | watch_time 累积上报 | P0 |
| `frontend/src/stores/feedStore.ts` | 新增推荐流 store | P2 |
| `frontend/src/hooks/useHomeFeed.ts` | 切换到 `/recommendations/home` | P2 |
| `frontend/src/app/(main)/page.tsx` | 顶部加"为你推荐"模块 | P2 |
| `frontend/src/app/(main)/browse/page.tsx` | 加 AI/编程/语言 分类 | P3 |

## Consequences

- **整体推迟（2026-07-06 重新定位为远期能力蓝图）**：当前阶段（13 视频 / 未上线 / 3 CRITICAL 阻塞）整体推迟，当务之急是上线（邮箱 / HTTPS / ICP）。仅 P0 行为采集可在上线后剥离单独启动，且后端无需 Redis Stream（当前规模直接写 PG 表够）。
- **P0 是阻塞项**：不先做行为采集，P1-P2 都是空跑（无数据训练）。强烈建议 P0 单独跑完上线，积累 1-2 周数据再启动 P1。
- **score 公式需要调参**：P1 的权重 0.30/0.25/0.20/0.15/0.10 是经验值，上线后需基于实际 click-through 数据回测调整。建议加一个 admin 调参端点，避免改代码重发。
- **YouTube Data API 配额**：默认 10000 单位/天，`search.list` 每次耗 100 单位——频道订阅场景够用，但全量视频元数据补全要分批。P3 优先用 `videos.list`（1 单位/次）补已有视频的元数据，`search.list` 仅用于频道新增视频发现。
- **不要过早引入 Kafka**：P0-P3 用 Redis Stream + PostgreSQL 足够；到 P4 行为事件日均 > 100 万条再考虑 Kafka。当前规模上 Kafka 是过度工程。
- **不要过早引入 embedding**：P1 用关键词 TopicMatch 已经能跑出 80% 效果，且计算成本几乎为 0。P4 上 embedding 主要是为了解决"用户兴趣语义漂移"问题，需要行为数据支撑，否则向量无意义。
- **新增表合计 5 张**：`behavior_events`（P0）、`video_scores`（P1）、`channels`/`channel_subscriptions`/`video_chapters`（P3），外加 `video_embeddings`（P4，需 pgvector 扩展）。
- **`finalize_video` 改动需做 GitNexus 影响分析**：它是视频流水线关键节点（被 `process_video` 调用、回调触发），编辑前必须 `gitnexus_impact({target: "finalize_video", direction: "upstream"})` 评估爆炸半径；提交前 `gitnexus_detect_changes()` 验证范围。
- **与 ADR-0006 标准版/Fork 正交**：评分针对 `Video` 行，标准版与 fork 共享同一 score——fork 不重复算分，继承标准版 score 即可（fork 不重新跑 GPU，元数据相同）。
- **与 ADR-0002 已冻结的口语评分无冲突**：本方案的 score 是"视频质量分"（用于排序推荐），不是"用户口语能力分"（已冻结）。命名上明确用 `learning_score` / `video_score`，避免与历史 `speaking_attempt_scores` 混淆。
- **首页推荐流改造对运营的影响**：P2 上线后，`is_featured` / `show_on_homepage` 不再决定首页首位，但仍保留作为"运营保底"——当 score 数据不足（新视频 < 5 个 click）时回退到人工精选。
- 本 ADR 不变更既有 ADR-0001~0006 的任何决议；落地执行参考本文件的分阶段计划，不再单独发 plan 文档。

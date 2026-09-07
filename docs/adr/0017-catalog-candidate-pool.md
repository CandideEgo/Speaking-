# ADR-0017: 视频候选池（Catalog）— 抓取发现与逐条策展上线解耦

- **Status**: Accepted - 2026-09-08

## Context

SeeWord 官方视频此前只有两条入库路径：`scripts/seed_official_videos.py`（硬编码 ~30 条精选，embed 轻量模式，不下载）与 admin `/videos/seed[-full]`（单条 URL → 完整管线：yt-dlp 下载转码 + 字幕 + 发布）。缺一个「批量发现候选 → 人工逐条筛选上线」的中间层：

- 竞品 Language Reactor 的公开目录 API（`api-cdn.dioco.io/base_media_getMediaDocs_5`，无需鉴权）可批量拉到带播放量 / 频道 / 时长 / 字幕状态 / 词汇难度（freqRank95）的 YouTube 视频元数据，`limit/offset` 分页。
- 但其「全英语·按时间」（`t_yt_all_en`, `sortBy=date`）池 ~80% 是新闻 / 体育 / 政治，不符合 SeeWord 选材标准（真实对话、2-20min、难度分级、避开 meme/纯音乐）。
- 直接把候选灌进 `videos` 表会污染正式视频语义（未处理行、UGC/official 双状态机），也不便「先看池子再决定处理哪个」。

## Decision

新增独立**候选池** `catalog_items`（与 `videos` 解耦）承载「抓取发现」；正式处理 / 发布仍复用现有 `seed_video` 管线，实现「处理一个、上线一个」：

1. **模型** `CatalogItem`：`(source, upstream_id)` 唯一（导入幂等）；存 YouTube 元数据 + `raw_meta`（无损原始记录）+ `fit_score` + `status`（new/queued/processing/published/skipped/error，普通 String 列以跨 SQLite/PG，同 `Video.review_status` 约定）+ `promoted_video_id`（FK→videos，SET NULL）。
2. **服务** `catalog_service`：`compute_fit_score`（时长峰值 3-10min / 字幕 / freqRank95 难度 / 播放量的**数值筛**，明确不做主题判断）+ 幂等 `import_records` + 列表（默认 fit 排序，join 被提升 Video 派生 `effective_status`，免 reconcile beat 任务）+ `promote_item`（复用 `seed_video`）+ `mark_item`。
3. **API** `/api/v1/admin/catalog*`（list/summary/get/promote/mark），全 admin-only。
4. **导入脚本** `scripts/import_catalog.py`（`--dry-run`），数据文件 `scripts/data/*.json` 随代码部署（可复现）。
5. **内容策展**：数值信号无法区分「新闻 vs 教育」，故改从 LR 频道级 API 按 `sortBy=views` 重抓 56 个英语教学 / 教育 / 谈话频道的 672 条高播放视频；import 时按 category 加权（english-learning +18 / educational +12 / talk +8）使学习内容在 fit 排序领先。

## Consequences

- 池现状 772 条（672 学习 + 100 新闻），Top-by-fit 全为学习内容（Veritasium / English with Lucy / TED / mmmEnglish …），全部带 YouTube 字幕，直接适配现有字幕管线。
- promote 走 `seed_video` 完整管线（下载 + 转码 + 自托管），依赖服务器 YouTube cookies（`youtube_cookies_service`，失效返回 423 需人工重登）。**embed 轻量模式暂未接入 promote**——现有轻量路径只存在于 `seed_official_videos.py` 脚本、未抽成 service；接入留作后续。
- **版权约束（已知会产品负责人）**：promote = 下载自托管第三方 YouTube 内容（含新闻媒体），存在侵权 + 违反 YouTube ToS 风险；商业上线前应对版权敏感内容改用 embed 播放或选用可授权 / CC 素材。
- 验证：新增 15 测试（全量 687 passed / 6 skipped）；ruff / mypy 干净；迁移 `f1g2h3i4j5k6`（← `e0f1g2h3i4j5`）已应用本地 PG 并验证建表。
- 未做（后续）：admin 前端「内容目录」页（Phase 2）、生产部署（Phase 3）、重抓脚本从 `.lr-scrape/` 收进 `backend/scripts/`。

## 关联

- ADR-0014（频道）：promote 后 ingest 经 `ensure_channel_for` 按 `channel_id` 自动挂接频道，教育频道会成为 SeeWord 作者页。
- `scripts/seed_official_videos.py`：既有官方选品标准（时长 / 难度 / 话题）被 `compute_fit_score` 借鉴。
- 领域术语：见 `.agent/context.md`「Catalog（候选池）」。

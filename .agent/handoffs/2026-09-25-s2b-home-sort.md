# Handoff: S2b — 首页「收藏最多 / 本周收藏」排序（后端）

- Owner: `video-pipeline`
- Status: dispatched
- Planner acceptance: `GET /api/v1/browse/feed?sort=favorite` 与 `?sort=weekly_favorite` 返回正确顺序与正确 `total`；`weekly_favorite` 的 Top-20 与 `GET /api/v1/videos/rankings?scope=weekly_favorites` 在同一时刻抽样一致；分页第 2 页不重复不漏。

## 任务

首页排序只有 `latest` / `hot`（`backend/app/api/v1/browse.py:100`，排序分支在 `:51`），而排行榜已有「本周收藏」（`backend/app/services/ranking_service.py`）。PO 要求首页**总量与本周两个排序都加**。

只做后端：给 `sort` 加 `favorite` 与 `weekly_favorite` 两个值，并复用排行榜的口径。

设计依据：`docs/plans/词汇训练与播放页返回-设计方案-2026-09.md` §2.2。

## 已完成

<!-- 由执行 agent 填写 -->

## 契约变更

<!-- 逐条列；本次预计仅 API 查询参数（不是 owners.md 列的契约文件）。若改了 schemas/ 或前端类型源，必须写明两端。 -->

## 关键决策

- **周界必须调用 `ranking_service.current_week_start_utc()`**（北京时间周一 00:00，固定 UTC+8），不要在 browse 里重写一遍——两个页面的「本周」必须同口径。
- 总量排序用现成的去规范化字段 `Video.favorite_count`（`backend/app/models/video.py:131`），不要实时 `COUNT(*)`。
- 本周排序用 `LEFT JOIN` 聚合子查询（视频表很小，全表排序可接受）；是否需要 `user_favorites(created_at)` 索引按实测决定，不要预加。
- 可见性过滤沿用 `_browse_feed_query` 现有三元组（official + published + status ∈ ready）。
- `@cached` 的 key 已含 `{sort}`（`browse.py:35`）——确认新 sort 值不会串缓存，但**不要**改 key 结构。
- 开工前对 `_browse_feed_query` 跑 `gitnexus_impact`（它是被 `browse_feed` 与缓存装饰器包裹的热路径）。

## 遗留

- 前端排序项（S2f）由 `frontend-main` 在本片合入后跟进，同文件 `hooks/usePlatformFeed.ts` + `components/home/HomeFilterBar.tsx` 与 S1 冲突，必须排在 S1 之后。

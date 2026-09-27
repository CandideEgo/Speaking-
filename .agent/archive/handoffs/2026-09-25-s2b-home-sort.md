# Handoff: S2b — 首页「收藏最多 / 本周收藏」排序（后端）

- Owner: `video-pipeline`
- Status: done
- Planner acceptance: `GET /api/v1/browse/feed?sort=favorite` 与 `?sort=weekly_favorite` 返回正确顺序与正确 `total`；`weekly_favorite` 的 Top-20 与 `GET /api/v1/videos/rankings?scope=weekly_favorites` 在同一时刻抽样一致；分页第 2 页不重复不漏。

## 任务

首页排序只有 `latest` / `hot`（`backend/app/api/v1/browse.py:100`，排序分支在 `:51`），而排行榜已有「本周收藏」（`backend/app/services/ranking_service.py`）。PO 要求首页**总量与本周两个排序都加**。

只做后端：给 `sort` 加 `favorite` 与 `weekly_favorite` 两个值，并复用排行榜的口径。

设计依据：`docs/plans/词汇训练与播放页返回-设计方案-2026-09.md` §2.2。

## 已完成

- `backend/app/api/v1/browse.py` — `sort` 的 `Literal` 扩为 `latest | hot | favorite | weekly_favorite`；`_browse_feed_query` 的排序改为显式四分支：`favorite` = `favorite_count DESC`，`weekly_favorite` = `LEFT JOIN` 本周聚合子查询后 `metric DESC NULLS LAST`。可见性三元组、category/level 过滤、分页与响应形状未动。
- `backend/tests/test_browse_feed.py`（新增，10 条，全绿）— 两个新排序的顺序与 `total`、本周窗口内外（含「上周 3 次收藏 + `favorite_count=50` 不得压过本周 1 次」）、可见性三元组、category/level 组合、Top-20 与周榜一致、两页不重复不漏（含 10 行全并列用例）、`{sort}` 缓存键不串、四个 sort 值都 200。
- 未改动：`ranking_service.py`（只调用其 `current_week_start_utc()`）、`models/`、`schemas/`、`migrations/`、前端、以及另一 agent 的任何文件。

## 契约变更

**API 查询参数**（`GET /api/v1/browse/feed` 的 `sort`）—— 不是 `owners.md` 列的四个契约文件，但两端都要知道：

- **后端（本片已完成）**：`sort` 接受 `latest | hot | favorite | weekly_favorite`；未知值仍 422；响应形状（卡片字段 + `page/page_size/has_more/total`）未变。
- **前端（S2f，未做）**：需同步**三处**，设计文档 §2.2 只列了前两处 ——
  1. `frontend/src/hooks/usePlatformFeed.ts:17` 的 `FeedSort` 联合类型；
  2. `frontend/src/hooks/usePlatformFeed.ts:19` 的 `SORT_VALUES` —— `isFeedSort()` 的白名单，**漏改则 URL 上的 `?sort=favorite` 静默回落到默认排序**（S1 已把筛选写进 URL，这条路径会被真实走到）；
  3. `frontend/src/components/home/HomeFilterBar.tsx:29-33` 的 `SORT_OPTIONS`（文案与图标由 S2f 定）。

`frontend/src/lib/api.ts`、`backend/app/schemas/*`、`backend/app/core/config.py`、`backend/app/api/dependencies.py` 均未改动。

## 关键决策

- **门禁 0 影响面**：`_browse_feed_query` 上游 = 1（`browse_feed`），受影响流程 0，模块 1，风险 **LOW**；`browse_feed` 上游 0（HTTP 路由，无静态调用方）。无 HIGH/CRITICAL，未触发「先报告」条件。
- **循环导入（实测踩到，后续改 browse.py 的人必读）**：`app/services/channel_service.py:25` 在模块级 `from app.api.v1.browse import _video_to_dict`，而 `ranking_service` 模块级 import `channel_service` —— 在 browse 模块级 import `ranking_service` 会成环（`ImportError: partially initialized module 'app.api.v1.browse'`）。故 `current_week_start_utc` 在 `weekly_favorite` 分支内**惰性导入**，与同文件 `_channel_slug_map` 惰性导入 channel_service 同一原因。
- **排序末位键用 `Video.id DESC`**：收藏数大量并列（多数视频为 0），没有唯一末位键时 OFFSET 分页会重复/漏行 —— 这是验收第 3 条的前提。`latest`/`hot` 保持原排序未动。与周榜的 `metric DESC, created_at DESC` 相比多一个 `id` 末位键，只在「计数与 `created_at` 都相同」时才会与周榜产生顺序差异。
- **`total` 语义**：`weekly_favorite` 的 `total` 是**全部可见视频**（含本周 0 收藏的），不是「有本周收藏的视频数」。feed 是浏览列表（设计文档 §2.2 指定 `LEFT JOIN`），没有本周收藏的视频必须仍能翻到、排在尾部。
- **缓存**：`@cached` 的 key 结构未动；实测两个新值各得独立 key（`browse:feed:all:all:favorite:1:20` / `…:weekly_favorite:1:20`），不串；`invalidate_browse_cache` 的 `browse:feed:*` 模式天然覆盖新 key。**周次不进 key**：跨周瞬间最多 5 分钟（TTL 300s）仍显示上周顺序，属票面「不要改 key 结构」的既定取舍。
- **DEC-041 被部分修订**：DEC-041 写过「feed 排序与周榜去重口径刻意不同源，周榜仍是 `/videos/rankings` 唯一职责」；`weekly_favorite` 进 feed 后后半句不再成立。`hot` 未变（仍是站内总播放，仍与 `weekly_views` 不同源）。按 AGENTS.md「改变主意 = 追加新条目」写 DEC-052 正文（见文末），**未自行写入 `decisions.md`**。
- **不加 `user_favorites(created_at)` 索引**：现只有 `user_id` / `video_id` 索引，本周聚合是全表扫描；按票面「不要预加」执行，测试量级未暴露问题。需要时再加即为迁移（且 `migrations/versions/` 本轮属另一 agent）。

## 遗留

- **S2f（前端）**：见「契约变更」的三处，必须排在 S1 之后（同文件 `usePlatformFeed.ts` / `HomeFilterBar.tsx`）。
- **`latest`/`hot` 的并列不稳定性未修**：多行同 `created_at` 时 OFFSET 分页仍可能重复/漏行（先于本片存在）。本次未动是刻意的范围控制，需要时另开票。
- **门禁 1 结果（看退出码）**：
  - `PYTHONUTF8=1 pytest tests/ -v` → **exit 0**，890 passed / 12 skipped / 0 failed。12 条 skip 全是 `test_catalog_pg.py`、`test_celery_tasks_pg.py`、`test_favorites_pg.py` 的 Postgres 集成用例（本机无 PG 可达，非本片所致）。
  - `ruff check app/ tests/` → **exit 0**。
  - `ruff format --check app/ tests/` → **exit 1**，唯一失败文件 `app/services/study_session_service.py` 是**另一执行 agent 的在途文件**；本片两个文件单跑 `ruff format --check` 为 exit 0。
  - `mypy app/ --ignore-missing-imports` → exit 1（78 条），与 `backend/.mypy-baseline` 逐对比较后**本片新增 0 条**；唯一新对 `app/api/v1/vocabulary.py:name-defined` 也是对方的在途文件。`app/api/v1/browse.py:attr-defined` 本就在基线里（`_video_to_dict` 的 `video_source.value`，未改）。
- **影响面分析报 risk `high`，是共享工作树的聚合结果**：14 文件 / 76 符号 / 13 流程，绝大多数是另一 agent 的 vocab-learning 在途改动。本片只贡献 `browse.py` 的 12 个符号，**不涉及任何受影响流程**（13 条流程全在 VocabDrillPage / `_update_daily_progress` 侧）；`_browse_featured_query` 被标 `touched` 是行号位移的启发式误报，`git diff` 未改它。
- **未跑 `/knowledge-maintain`**：本片只改 1 个模块（`api/v1/browse.py`），未达 AGENTS.md 的「≥2 个 service/模块」门槛。`wiki/` 无页面记录 feed 的 sort 取值，无需刷新。

### DEC 条目（待 planner 合并）

追加到 `.agent/decisions.md` **末尾**（下一个空位；正文格式对齐现有条目）：

```markdown
## 2026-09-25 — 首页 feed 加「收藏最多 / 本周收藏」排序（修订 DEC-041 的「刻意不同源」条款）

**Problem**: 首页排序只有 `latest`/`hot`，产品方要求把排行榜已有的「本周收藏」也搬进首页排序（设计文档 §2.2）。但 DEC-041 定 `hot` 时明确写过「feed 排序与周榜去重口径刻意不同源，周榜仍是 `/videos/rankings` 唯一职责」——`weekly_favorite` 一旦进 feed，后半句不再成立，需要重新裁决「周榜口径能否有第二个消费者」。

**Options**: A) feed 直接复用排行榜快照（零后端改动，但快照只有固定 Top-20、不与分类/难度组合、无分页）；B) feed 的 `sort` 加值、周界调用 `ranking_service.current_week_start_utc()`，缓存仍走 `browse:feed:*`；C) 在 browse 里另写一套周界与聚合，保持与周榜彻底独立。

**Decision**: B。`sort` 扩为 `latest|hot|favorite|weekly_favorite`；`favorite` 用去规范化列 `Video.favorite_count`（不 `COUNT(*)`）；`weekly_favorite` 用 `LEFT JOIN (SELECT video_id, COUNT(*) FROM user_favorites WHERE created_at >= 本周一 GROUP BY video_id)`，排序 `metric DESC NULLS LAST, created_at DESC, id DESC`。周界**只**经 `current_week_start_utc()` 取，不在 browse 重写。DEC-041 的其余部分（feed 加 `sort`、首页删 `RankingBlock`）不变；`hot` 仍是站内总播放、仍与 `weekly_views` 不同源。

**Reason**: A 回答不了「这个分类里的本周收藏是什么」——feed 是带筛选的分页列表，需要能排序的 SQL；C 会让「本周」出现第二个定义，两个页面迟早漂移，而 DEC-038 已把周界收敛成一个函数。feed 用 `LEFT JOIN` 而非排行榜的 `INNER JOIN`：feed 是浏览列表，没有本周收藏的视频必须仍能翻到，排在尾部。

**Trade-offs**:
- 同一时点两个页面的 Top-20 可能不同：feed 缓存 TTL 300s，周榜快照由 beat 每日重算（最长滞后约 24h）。口径一致、快照不一致，是「复用口径不复用缓存」的既定取舍。
- feed 缓存的 key 不含周次，跨周瞬间最多 5 分钟仍显示上周顺序（`@cached` key 结构本次不动）。
- 两个新排序以 `Video.id` 收尾做唯一 tiebreak：收藏数大量并列（多数视频为 0），没有唯一末位键时 OFFSET 分页会重复/漏行。`latest`/`hot` 保留原排序，其并列不稳定性未修。
- 不加 `user_favorites(created_at)` 索引（视频表小、全表排序可接受）；实测需要再加即为迁移。
```

`decisions-index.md` 对应行（追加到表末）：

```markdown
| DEC-052 | 2026-09-25 | 首页 feed 加「收藏最多 / 本周收藏」排序（修订 DEC-041 的「刻意不同源」条款） | — | active |
```

> 若 planner 打算给本批（S1/S2b/S3）合并成一条 DEC，本片内容可整段并入，但「修订 DEC-041 的同源条款」这一点建议保留 —— 只看 DEC-041 会得出相反结论。

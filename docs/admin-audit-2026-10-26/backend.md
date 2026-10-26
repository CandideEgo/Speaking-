# 后台管理面板后端审计 — 2026-10-26

## 0. 快照、范围与方法

| 项 | 值 |
|---|---|
| 仓库 / 分支 | `C:\Users\Administrator\Speaking`，`redesign` |
| **基线 commit** | **`69eb4c7`**（`feat(watch): resizable split layout and shell-integrated player bar`） |
| 审计时间窗 | 2026-10-26 12:08 → 12:26（America/Denver，即 UTC 18:08 → 18:26） |
| 行号基准 | **HEAD `69eb4c7` 的文件内容**（审计期间工作区在被并行改动，我把用到的文件导出到 `.tmp-diag/backend-audit/head/` 核对行号；正文所有 `file:line` 均以此为准） |
| 运行时 | 后端 `http://127.0.0.1:8000`（ENV=development，uvicorn `--reload`）、Postgres 16 `speaking-db-1`、Redis 7 |
| 审计方式 | 只读：读码 + OpenAPI/AST 枚举 + 只读 GET 探测 + 直接 SQL 查询；**未做任何写操作** |

### 0.1 并行清理导致的快照漂移（重要）

任务要求「以当前文件为准」并注明快照，但审计期间另一位队友正在清理 redeem/退役表，工作区与运行时都在变：

- 审计开始时 live OpenAPI：**241 条路径 / 62 条 admin 路径**；约 12:20 再看：**206 条路径 / 60 条 admin 路径**。
- 12:12 时 `backend/app/services/admin_service.py` 一度处于中间态（`RedeemCode` 引用已删、`revoke_redeem_code`/`refund_redeem_code` 仍在），**模块无法导入**；12:18 前已自行恢复。期间有一次探测遇到 `ConnectionResetError`（reload 打断）。
- 工作区相对 HEAD 的改动在审计窗口内从 0 增长到 **64 个路径**（含 `admin.py` −37 行、`redeem.py` 整个删除、`main.py` −2 行）。

因此：**所有 finding 以 HEAD `69eb4c7` 为准**；已被并行清理处理的项（redeem/兑换记录、`redeems_today`、退役表）按任务要求**不作为 finding**，只在 §0.2 记录，以免与队友工作重复。

### 0.2 并行清理相关的集成提示（不计入 finding，交给 Lead 合并时核对）

| 项 | HEAD 状态 | 审计窗口内的现状 | 需同步的消费者 |
|---|---|---|---|
| `GET /api/v1/admin/redemptions`、`/redemptions/summary` | 存在（admin.py:175-198） | 已从 `admin.py` 删除，live 返回 404；OpenAPI 少 2 条路径 | `schemas/admin.py::AdminRedemptionRow`/`RedemptionSummaryResponse`、`adminData.listRedemptions/redemptionSummary`、订单页 |
| `AdminStatsResponse.redeems_today` | 必填字段（schemas/admin.py:175）；`_compute_admin_stats` 产出（admin_service.py:159、313） | 工作区已从 service+schema 移除；live stats 响应里已无该键 | HEAD 上另有 4 个消费者：`frontend/.../(shell)/page.tsx:224`、`stats/page.tsx:251`、`types/index.ts:482`、`tests/test_presence.py:37/46-65`（工作区已全部同步删除） |
| `app/api/v1/redeem.py` + `app/models/redeem.py` | 存在，`/api/v1/redeem-codes*` 7 条路由 | 文件已删，`main.py` 不再挂载 | `tests/test_redeem.py`（已删）、`frontend/(admin)/orders` 页（已删） |

> 建议：提交前至少跑一次 `python -c "import app.main"` + `pytest tests/test_presence.py tests/test_response_contract.py tests/test_admin_panel.py -q`。本次审计期间亲眼看到该中间态导致模块导入失败，这类错误不会在 diff review 里显眼。

### 0.3 未执行项（如实标注）

- **全部写操作未实测**（ban/role/plan/settings PUT/seed/start-processing/recover/retry/retranslate/localize/takedown/resegment/reorder/公告广播等）；相关结论来自读码 + DB schema + 既有测试存在性。
- 管线并发、锁 TTL、GPU 回调失败、Celery 行为：本轮**没有触发任何真实转写/回调**（只确认 Redis 里 GPU launcher 心跳在线：`worker:gpu:heartbeat` TTL=55s、`LLEN transcription_gpu`=0），这些路径**未执行**。
- 全量 `pytest`、`ruff`、`mypy`、`alembic check`：**未执行**（本次是只读审计，时间给了探测）。
- 没有做压测/并发写实验（会写数据，被硬约束禁止）。

---

## 1. 结论摘要

**没有发现 P0**（未发现未授权可用的越权、RCE、凭据泄漏）。管理面的骨架是健康的：**70 条管理路由全部挂 `get_admin_user` 且全部有路由级限流**（§2 逐条核验），令牌类型/黑名单/改密/封禁都走同一条 `_authenticate` 链，错误 envelope 统一，字幕编辑有 before/after 审计表。

真正值得修的是三类：

1. **数据不可逆**：`resegment`（重断句）会通过 DB 级联静默删除**所有用户对该视频的原句收藏**、清空字幕编辑审计、并把词汇的来源句置空，而回滚只恢复字幕（ADM-01，**P1**）。
2. **管线动作缺少互斥/幂等**：`retranslate` 不校验状态且「先清空译文再派发」，`recover/retry` 无条件删锁，`/videos/seed` 去重只覆盖 ready 状态（连点即重复转写）——都是可复现的竞态/浪费（ADM-02~04，**P2**）。
3. **统计与运营口径不可信**：`pro_users`/`funnel.pro` 用 `plan` 列（含已过期，实测 611 vs 有效 284）；后台看不到任何真实收款（只读 legacy `orders` 空表）；公告广播在请求里对全表用户逐条 fan-out（ADM-05~07，**P2**）。

**数量：P1 × 1，P2 × 6，P3 × 12（共 19 条）**，另有 8 条「优化机会」与 7 处测试缺口。未发现需要动用 P0 流程的问题。

---

## 2. 端点清单（HEAD：70 条管理面路由）

统计方式：`git show HEAD:...` 对 6 个路由文件做 AST 扫描（方法 + 子路径 + `@rate_limit` + `response_model`），并用运行时 `create_app()` 依赖树交叉验证。**70/70 都有 `Depends(get_admin_user)`，70/70 都有 `@rate_limit`**（含 12 条 `admin.py`、31 条 `videos.py admin` + 2 条 `/videos/seed*`、5 条 `channels admin`、3 条 `admin/feedback|announcements`、5 条 `admin/catalog`、12 条 `admin/home-content`）。

> 注：`/api/v1/videos/seed`、`/seed-full` 虽不在 `/admin` 前缀下，但是管理端「添加视频」在用且仅管理员可用，一并计入。限流键是 JWT `sub`（管理员自己），不是 IP（`core/limiter.py:12-29`）；实测 32 次 `/admin/admins` → 30×200 + 2×429。

| # | 方法 | 路径 | 限流 | response_model |
|---|---|---|---|---|
| 1 | GET | `/api/v1/admin/worker-status` | 30/minute | `WorkerStatusResponse` |
| 2 | GET | `/api/v1/admin/stats` | 30/minute | `AdminStatsResponse` |
| 3 | GET | `/api/v1/admin/users` | 30/minute | `PaginatedResponse[AdminUserRow]` |
| 4 | PATCH | `/api/v1/admin/users/{user_id}/ban` | 10/minute | `AdminUserBanResponse` |
| 5 | PATCH | `/api/v1/admin/users/{user_id}/role` | 10/minute | `AdminUserRoleResponse` |
| 6 | PATCH | `/api/v1/admin/users/{user_id}/plan` | 10/minute | `AdminUserPlanResponse` |
| 7 | GET | `/api/v1/admin/orders` | 30/minute | `PaginatedResponse[AdminOrderRow]` |
| 8 | GET | `/api/v1/admin/redemptions` | 30/minute | `PaginatedResponse[AdminRedemptionRow]` |
| 9 | GET | `/api/v1/admin/redemptions/summary` | 30/minute | `RedemptionSummaryResponse` |
| 10 | GET | `/api/v1/admin/settings` | 30/minute | `AdminSettingsResponse` |
| 11 | PUT | `/api/v1/admin/settings` | 10/minute | `AdminSettingsResponse` |
| 12 | GET | `/api/v1/admin/admins` | 30/minute | `list[AdminAccountItem]` |
| 13 | GET | `/api/v1/videos/admin` | 30/minute | `PaginatedResponse[VideoAdminResponse]` |
| 14 | GET | `/api/v1/videos/admin/pending-count` | 30/minute | `PendingCountsResponse` |
| 15 | PATCH | `/api/v1/videos/admin/{video_id}` | 30/minute | `VideoAdminResponse` |
| 16 | DELETE | `/api/v1/videos/admin/{video_id}` | 30/minute | —（204） |
| 17 | POST | `/api/v1/videos/admin/{video_id}/start-processing` | 10/minute | `VideoAdminResponse` |
| 18 | POST | `/api/v1/videos/admin/{video_id}/recover` | 10/minute | `VideoAdminResponse` |
| 19 | POST | `/api/v1/videos/admin/{video_id}/retry` | 10/minute | `VideoAdminResponse` |
| 20 | GET | `/api/v1/videos/admin/takedown-suggestions` | 30/minute | `TakedownSuggestionsResponse` |
| 21 | POST | `/api/v1/videos/admin/{video_id}/takedown` | 10/minute | `VideoAdminResponse` |
| 22 | POST | `/api/v1/videos/admin/{video_id}/localize` | 5/minute | `VideoAdminResponse` |
| 23 | POST | `/api/v1/videos/admin/{video_id}/retranslate` | 10/minute | `VideoAdminResponse` |
| 24 | GET | `/api/v1/videos/admin/{video_id}/quality-reports` | 30/minute | `list[QualityReportItem]` |
| 25 | PATCH | `/api/v1/videos/admin/{video_id}/subtitles/{subtitle_id}` | 60/minute | `SubtitleResponse` |
| 26 | PATCH | `/api/v1/videos/admin/{video_id}/subtitles` | 60/minute | `list[SubtitleResponse]` |
| 27 | POST | `/api/v1/videos/admin/{video_id}/subtitles` | 60/minute | `SubtitleResponse` |
| 28 | POST | `/api/v1/videos/admin/{video_id}/subtitles/reorder` | 30/minute | `list[SubtitleResponse]` |
| 29 | DELETE | `/api/v1/videos/admin/{video_id}/subtitles/{subtitle_id}` | 60/minute | `dict` ❗ |
| 30 | POST | `/api/v1/videos/admin/{video_id}/subtitles/{subtitle_id}/split` | 60/minute | `list[SubtitleResponse]` |
| 31 | POST | `/api/v1/videos/admin/{video_id}/subtitles/{subtitle_id}/merge` | 60/minute | `SubtitleResponse` |
| 32 | POST | `/api/v1/videos/admin/{video_id}/subtitles/resegment` | 10/minute | `dict` ❗ |
| 33 | POST | `/api/v1/videos/admin/{video_id}/subtitles/resegment/rollback` | 10/minute | `dict` ❗ |
| 34 | PATCH | `/api/v1/videos/admin/{video_id}/subtitles/{subtitle_id}/word-levels` | 60/minute | `SubtitleResponse` |
| 35 | POST | `/api/v1/videos/admin/{video_id}/subtitles/word-levels/recompute` | 10/minute | `RecomputeWordLevelsResponse` |
| 36 | POST | `/api/v1/videos/admin/{video_id}/subtitles/{subtitle_id}/rollback/{revision_id}` | 30/minute | `SubtitleResponse` |
| 37 | GET | `/api/v1/videos/admin/{video_id}/subtitles/revisions` | 30/minute | `PaginatedResponse[SubtitleRevisionItem]` |
| 38 | GET | `/api/v1/videos/admin/{video_id}/subtitles/{subtitle_id}/revisions` | 30/minute | `PaginatedResponse[SubtitleRevisionItem]` |
| 39 | POST | `/api/v1/videos/admin/{video_id}/review/approve` | 30/minute | `VideoAdminResponse` |
| 40 | POST | `/api/v1/videos/admin/{video_id}/review/reject` | 30/minute | `VideoAdminResponse` |
| 41 | GET | `/api/v1/videos/admin/{video_id}/detail` | 30/minute | `VideoDetailResponse` |
| 42 | GET | `/api/v1/videos/admin/{video_id}/status` | 30/minute | `VideoAdminStatusResponse` |
| 43 | GET | `/api/v1/videos/admin/{video_id}/score` | 30/minute | `dict` ❗ |
| 44 | POST | `/api/v1/videos/seed` | 5/minute | `VideoResponse` |
| 45 | POST | `/api/v1/videos/seed-full` | 3/minute | `VideoResponse` |
| 46 | GET | `/api/v1/channels/admin/all` | 30/minute | `AdminChannelListResponse` |
| 47 | POST | `/api/v1/channels/admin` | 30/minute | `ChannelAdminRefResponse` |
| 48 | PATCH | `/api/v1/channels/admin/{channel_id}` | 30/minute | `ChannelAdminRefResponse` |
| 49 | DELETE | `/api/v1/channels/admin/{channel_id}` | 30/minute | —（204） |
| 50 | POST | `/api/v1/channels/admin/{channel_id}/videos` | 30/minute | `ChannelAttachVideosResponse` |
| 51 | GET | `/api/v1/admin/feedback` | 30/minute | `dict` ❗ |
| 52 | PATCH | `/api/v1/admin/feedback/{feedback_id}` | 60/minute | `AdminFeedbackResponse` |
| 53 | POST | `/api/v1/admin/announcements` | 10/minute | `AnnouncementResponse` |
| 54 | GET | `/api/v1/admin/catalog` | 60/minute | `PaginatedResponse[CatalogItemResponse]` |
| 55 | GET | `/api/v1/admin/catalog/summary` | 60/minute | `CatalogSummaryResponse` |
| 56 | GET | `/api/v1/admin/catalog/{item_id}` | 60/minute | `CatalogItemResponse` |
| 57 | POST | `/api/v1/admin/catalog/{item_id}/promote` | 10/minute | `CatalogItemResponse` |
| 58 | PATCH | `/api/v1/admin/catalog/{item_id}` | 30/minute | `CatalogItemResponse` |
| 59 | GET | `/api/v1/admin/home-content/videos/{video_id}` | 60/minute | `HomeContentVideoState` |
| 60 | POST | `/api/v1/admin/home-content/videos/{video_id}/generate` | 10/minute | `HomeContentGenerationResponse` |
| 61 | GET | `/api/v1/admin/home-content/videos/{video_id}/generation` | 60/minute | `HomeContentGenerationEnvelope` |
| 62 | PUT | `/api/v1/admin/home-content/videos/{video_id}/draft` | 30/minute | `HomeContentVideoState` |
| 63 | POST | `/api/v1/admin/home-content/videos/{video_id}/publish` | 10/minute | `HomeContentPublishResponse` |
| 64 | POST | `/api/v1/admin/home-content/videos/{video_id}/restore-draft` | 10/minute | `HomeContentVideoState` |
| 65 | GET | `/api/v1/admin/home-content/videos/{video_id}/preview` | 60/minute | `HomeLayoutPreview` |
| 66 | GET | `/api/v1/admin/home-content/layout` | 60/minute | `HomeLayoutState` |
| 67 | PUT | `/api/v1/admin/home-content/layout/draft` | 30/minute | `HomeLayoutState` |
| 68 | POST | `/api/v1/admin/home-content/layout/publish` | 10/minute | `HomeLayoutPublishResponse` |
| 69 | POST | `/api/v1/admin/home-content/layout/rollback` | 10/minute | `HomeLayoutPublishResponse` |
| 70 | GET | `/api/v1/admin/home-content/layout/preview` | 60/minute | `HomeLayoutPreview` |

❗ = OpenAPI 里退化为 `object`（无字段 schema）。另：`#8/#9` 正在被并行清理移除（§0.2）。

**鉴权实测**：无 token → 401 `HTTP_401`；拿 refresh token 打 `/admin/stats` → 401 `"Invalid token type"`；`?token=` 查询参数不认（401）。即管理面不接受非 access 令牌、也不接受媒体面那条 `?token=` 通道。✔

---

## 3. 发现

> 证据类型标注：**读码** / **实测**（本地服务只读 GET 或 SQL）/ **门禁/静态**（AST、OpenAPI、grep）。写操作未实测的一律注明。

### P1 — 高

#### ADM-01 重断句（resegment）静默删除用户原句收藏、清空字幕审计、断开词汇来源句链，且回滚不可恢复

- **位置**：`app/services/subtitle_edit_service.py:780-856`（`resegment_video`：`db.add(snapshot)` 后 `for s in subs: await db.delete(s)`，:829-831）、`:859-911`（`rollback_resegment`：删当前行后**用新 UUID** 重建，:886-905）；路由 `app/api/v1/videos.py:603-615`（`POST /videos/admin/{video_id}/subtitles/resegment`，无任何确认/force 参数）
- **级联证据（DB 实际 FK）**：

  | 子表 | FK | ondelete | 后果 |
  |---|---|---|---|
  | `sentence_favorites.subtitle_id` | → `subtitles.id` | **CASCADE** | 所有用户对该视频的原句收藏被删，**回滚不恢复**（快照不含收藏） |
  | `subtitle_revisions.subtitle_id` | → `subtitles.id` | **CASCADE** | 该视频全部字幕编辑历史被删 → 之后无法逐行回滚/追责 |
  | `vocabulary.subtitle_id` | → `subtitles.id` | SET NULL | 词条的「来源句」链断（单词本身还在） |

  实测：`select conname, delete_rule ... where ccu.table_name='subtitles'` 返回 `sentence_favorites CASCADE / subtitle_revisions CASCADE / vocabulary SET NULL`。dev 库里 `sentence_favorites = 0`，所以**本次没有真实数据损失**，但生产有收藏时就是一次性、无提示、不可恢复的删除。
- **同源问题**：`DELETE /videos/admin/{video_id}/subtitles/{subtitle_id}`（`videos.py:556-567` + `subtitle_edit_service.py:366-408`）也会通过同一个 `CASCADE` 删掉该行的编辑历史与用户收藏；删除单行时影响面小，但接口同样不返回/不提示受影响行数。
- **影响**：管理员为了解决「断句不理想」点一次按钮，代价是全体用户的原句收藏消失、字幕编辑审计归零；用户侧只会看到收藏凭空少了。`rollback_resegment` 只回字幕，被删的收藏与 revision **永远回不来**。
- **修复建议（按成本排序）**：
  1. `sentence_favorites` 不要用「subtitle_id 单一外键」：加 `video_id + start_time + end_time + text_en` 快照列，resegment 时按时间区间把收藏重新映射到新分段（找不到就保留为「已失效」态）；这是根治。
  2. 短期：resegment 前把 `sentence_favorites` / `subtitle_revisions` 备份进 `subtitle_resegment_snapshots`（同表已有 JSON 快照，扩一个字段即可），rollback 时一并还原；但注意新分段 id 变化后收藏需要重新指向。
  3. 至少：接口加 `?confirm_side_effects=true`（缺省 400 并返回影响计数：`affected_favorites`/`affected_revisions`），前端确认框把「将删除 N 条用户原句收藏」写清楚。
- **验证**：读码 + DB FK 实测 + 现有测试核对（`tests/test_subtitle_resegment.py` 4 条只断言字幕数量/文本，**没有任何副作用断言**）。

### P2 — 中

#### ADM-02 `retranslate` 无状态守卫，且「先清空译文 → 再派发」：可打正在跑的视频，派发失败即永久丢译文

- **位置**：`app/services/video_seed_service.py:473-535`；路由 `app/api/v1/videos.py:432-450`
- **问题**：函数只校验「有字幕」，**不看 `video.status`**（:492-500）；随后把所有 `text_zh = None`（:502-507）→ 把 `status` 强改为 `ready_subtitles`、`quality_flag=None`（:509-513）→ **先 `commit`（:529）** → 之后才 `finalize_video.delay(..., engine=engine)`（:531-533）。
- **影响**：
  1. 对 `processing`（正在翻译/下载）的视频执行 → 正在跑的 finalize 会被清掉已有译文，同时新任务与旧任务并发写同一批字幕行；
  2. `delay` 抛错（Redis/broker 不可用、序列化失败）时事务已提交 → **译文全部丢失且没有任务在跑**，视频卡在 `ready_subtitles` + 空译文，只能再点一次（此时若仍失败就死循环）；
  3. `engine` 来自 query 且**不做白名单校验**（:437 文档列了 `glm|qwen|hy_mt2|agnes|custom`），非法值要等任务里抛错，管理员在后台只看到「转圈变成失败」。
- **修复建议**：① 加状态守卫（只允许 `error` / `ready` / `quality_blocked|quality_warning`；`processing`/`ready_subtitles` 一律 409 并提示先 `recover`）；② 顺序改成「拿单飞锁（Redis `SET NX`），成功派发后再清空并提交」或把清空放进 Celery 任务里做（任务开头再清）；③ `engine` 用 `Literal[...]` 校验。
- **验证**：读码。写操作未实测。

#### ADM-03 `recover` / `retry` 无条件删除 `video:processing:{id}` 锁，无法区分「陈旧锁」与「正在运行的活锁」

- **位置**：`app/services/video_seed_service.py:380-394`（recover）、`:439-455`（retry）；路由 `videos.py:343-383`
- **问题**：两个动作都先 `await r.delete("video:processing:{id}")` 再 `finalize_video.delay(...)`。状态判断只区分 `processing`/`ready_subtitles` vs `error`，**不读锁的年龄**（`step_started_at` 就在库里，但没用）。
- **影响**：正常运行的 finalize 持锁期间，管理员点「恢复」会把活锁删掉 → 第二个 finalize 拿到锁并从头跑到 `_is_step_done()` 未标记的步骤 → 两路并发写 `subtitles.text_zh` / `quality_flag` / 下载产物。这条与历史发现 **BE-12（锁 TTL 60min < tail 预算 165min）** 叠加：长视频尾段越可能处于「锁已过期或即将过期」的窗口。连点两次（限流 10/min 允许）也能稳定复现双派发。
- **修复建议**：锁值改成 run-id，删除用 compare-and-delete（`GET` 后比对，或用 Lua 脚本）；或在删锁前判断 `now - step_started_at > 该步骤预算 × 1.2` 才允许；`recover` 与 `retry` 加 Redis 单飞键（同视频 60s 内只接受一次）。
- **验证**：读码 + 历史发现对照；未在真实 Celery 上复现。

#### ADM-04 `/videos/seed` 与 `/seed-full` 去重只覆盖 `ready`/`ready_subtitles`：连点即重复建行 + 重复 GPU 转写

- **位置**：`app/services/video_seed_service.py:93-127`（`existing` 查询条件 `Video.status.in_([ready, ready_subtitles])`）；路由 `videos.py:1102-1149`（限流 5/min、3/min）
- **证据**：DB `videos` 表只有 **非唯一** 索引 `ix_videos_source_url`（实测 `pg_indexes`），没有 `(source_url, is_official)` 唯一约束；`seed_video` 里也没有 URL 级锁。因此两次请求若都在第一次 `process_video` 完成前到达（`status=processing`），第二次**不会命中**去重分支。
- **影响**：管理端「添加视频」双击 = 2 行 video（同 URL）+ 2 次 `process_video`（含一次真实 GPU 转写费用）；两条行都会走到 `ready`，首页/榜单出现重复内容，且删除其中一条要手工清理。对比 `catalog_service._find_reusable_video`（`catalog_service.py:330-378`）已用「URL 级 + 行锁」正确处理同样问题，说明这是遗漏而非设计。
- **修复建议**：去重条件扩到 `pending_processing/processing/ready_subtitles/ready`（error 除外，error 允许重试）；并发窗口用 Redis `SET NX`（`seed:{sha1(source_url)}`, TTL 120s）或给 `videos(source_url, is_official)` 加部分唯一索引（注意历史重复行要先清理）。
- **验证**：读码 + `pg_indexes`/`information_schema` 实测；写操作未实测。

#### ADM-05 统计口径：`pro_users` / `funnel.pro` / `users_by_plan` 把**已过期**的 Pro 算作 Pro；且「过期降级」任务不存在，KPI 长期虚高

- **位置**：`app/services/admin_service.py:139`（`pro_users = count(plan == pro)`）、`:248-256`（`funnel.pro = pro_users`）、`:230-231`（`users_by_plan`）；真实口径在 `app/services/unlock_service.py:37-51`（`is_active_pro`：`plan == pro AND (plan_expires_at IS NULL OR > now)`）
- **实测（12:20 左右，dev DB）**：
  - DB：`plan='pro'` = **611**；其中 `plan_expires_at < now()` = **327** → 有效 Pro = **284**；
  - API：`/admin/stats` → `pro_users=611`、`pro_expired_count=327`、`funnel={registered:614, watched:222, vocab_saved:30, pro:611}`、`users_by_plan=[{pro:611},{free:3}]`；
  - 即「注册 → 开通 Pro」显示 **614 → 611（99.5%）**，而真实付费/有效档位只有 284。
- **补充证据**：`unlock_service.is_active_pro` 的 docstring 写「the downgrade beat runs hourly」，但 **全仓没有任何降级任务**：`grep PlanType.free` 只命中 `app/models/user.py:40` 的默认值，`celery_app.py:33-116` 的 beat 清单里也没有；因此 `plan` 列一旦置 pro 就永远是 pro，`pro_users` 只会越涨越多（只会被 `pro_expired_count` 部分抵消）。
- **影响**：后台「Pro 用户」「Pro 转化漏斗」「用户分布」三个图全部失真（当前虚高 2.15×）；`/admin/users?plan=pro` 也返回 611（含过期），只有单独选「已过期」才看得到 327。运营据此判断会员规模会直接误判。
- **修复建议**：① `pro_users` 改成 `plan == pro AND (plan_expires_at IS NULL OR plan_expires_at > now)`；`users_by_plan` 同理或拆成 `pro_active` / `pro_expired` 两段；② 若确实要保留「曾经是 Pro」的语义，则字段改名（`ever_pro_users`）并在前端标注；③ 修正 `is_active_pro` 的错误 docstring；④ 若要真做降级，注意 `plan_source` 溯源（见 ADM-17）与 `jinshuju` 续期的 `with_for_update` 语义。
- **验证**：实测（API + SQL 对照）+ 读码 + `grep` beat 清单。

#### ADM-06 后台看不到真实收款：`recent_activity` 的 payment 只读 legacy `orders`（空表），真实付款在 `jinshuju_payments`

- **位置**：`app/services/admin_service.py:277-294`（recent activity 的 payment 来源 `Order`）、`:704-738`（`/admin/orders` 查 `Order`）；真实收款链路 `app/services/jinshuju_service.py:355-359`（写 `plan_expires_at` + `plan_source='purchase'`）
- **实测**：`orders` = 0 行、`jinshuju_payments` = 0 行（dev）；`/admin/stats` 的 `recent_activity` **8 条全是 `signup`**，`type="payment"` 永不出现；`/admin/orders` 返回 200 + `total: 0`。
- **影响**：内测免费期后一旦走金数据收款，后台「最近动态」永远不会显示购买，管理面板里也**没有任何真实收款/收入视图**（没有 revenue KPI，也没有 jinshuju 列表端点）；运营/财务无法对账。`/admin/orders` 是空表死端点（见 ADM-19）。
- **修复建议**：recent_activity 改读 `jinshuju_payments`（`status` 成功 + `entry_created_at`）并保留 orders 兼容旧数据；后台加「付款记录」列表（复用 `list_redemptions` 的分页/筛选形状）；在 stats 里加一项「近 30 天收款金额/笔数」（`amount_fen` 求和，注意脱敏，不返回 `raw_json`）。
- **验证**：读码 + 实测（两张表计数、recent_activity 内容）。

#### ADM-07 公告广播在 HTTP 请求内对全表用户逐条 INSERT + WebSocket 推送：长事务、线性耗时、无历史/不可撤回

- **位置**：`app/api/v1/feedback.py:158-177` → `app/services/notification_service.py:195-231`
- **问题**：`users = (await db.scalars(select(User))).all()`（全表进内存，无 limit）；对每个用户 `create_notification(...)`（一次 `SELECT` 去重 + `INSERT` + `flush` + `_push_notification` 的 WS 发送）；**整个循环共用同一个事务**，最后 `commit` 一次。没有 Celery、没有批量插入、没有分页；也没有「公告」实体表（消息按用户复制），所以**没有撤销/编辑/已读统计**。
- **实测/规模推算**：dev 614 用户无压力；按现行实现，1 万用户 = 1 万次 DB 往返 + 1 万次 WS 尝试，全部在一个 uvicorn 请求里，超过反向代理默认 60s 就会 504，且客户端断开后事务可能被取消（部分用户收到、部分没收到）。限流 10/min 允许连续 10 次全量 fan-out（重复公告除了 `related_url` 相同时的去重之外没有任何阻断）。
- **修复建议**：改成 Celery 任务 + `bulk_insert_mappings`（或 `insert()` 多值）分批 1000 条；建 `announcements` 表（id/title/message/related_url/created_by/created_at）+ 用户已读表，`POST /admin/announcements` 只落一行 + 入队；前端未读公告从公告表读，而不是 N 条 notification。
- **验证**：读码 + 实测（当前用户量下行为正常；性能结论为规模推算，未压测）。

### P3 — 低

#### ADM-08 系统设置 12 个字段里有 6 个**没有任何消费者**（包括危险的 `payments_enabled`）

- **位置**：`app/models/admin_setting.py:25-48`；写入 `app/api/v1/admin.py:232-256`、读取回声 `admin.py:206-229`
- **grep 实证的消费者清单**（`app/**/*.py`）：

  | 字段 | 有消费者？ | 读取点 |
  |---|---|---|
  | `registration_enabled` | ✅ | `api/v1/auth.py:64-69`（注册/密码登录） |
  | `quality_block_enabled` + 两个阈值 | ✅ | `tasks/video_processing.py:145-170,604` |
  | `watchdog_enabled` | ✅ | `tasks/video_processing.py:1058` |
  | `download_auto_retry_enabled` | ✅ | `tasks/video_processing.py:1595-1603` |
  | `site_name` | ❌ | 全仓仅出现在 model/schema/echo |
  | `wechat_shop_url` | ❌ | 同上（真实购买入口来自 env `JINSHUJU_*`） |
  | `payments_enabled` | ❌ | **`payments.py:116/175/217` 读的是 env `settings.payments_enabled`（core/config.py:184），不是 DB 行** |
  | `translate_timeout_sec` | ❌ | watchdog 用的是 env 的 per-step 预算（`core/config.py:123-130`） |
  | `download_timeout_sec` | ❌ | 同上 |
  | `hallucination_detection_enabled` | ❌ | 无读取点 |
- **影响**：后台「系统设置」页一半开关改了不生效，最危险的是 `payments_enabled`——管理员以为在后台打开就能开站内支付，实际被 ICP 合规的 env 开关挡着（两个开关语义还不一样）。`translate/download` 超时同理，改完看门狗行为不变，排障时会误判。这是典型的「UI 承诺 > 后端实现」。
- **修复建议**：二选一——① 接上消费者（`payments_enabled` 若要保留就必须改成「env 与 DB 都开」的双门并在响应里返回 `effective_enabled`；超时接 `_effective_steps`）；② 从设置页与 schema 删除这 6 个字段，DB 列留作历史。顺手在 `admin/settings` 的 docstring 里写清「哪些字段生效」。
- **验证**：读码 + `grep` 全仓字段名。

#### ADM-09 最后管理员保护缺失（只防「操作自己」）+ 管理操作无持久审计

- **位置**：`app/services/admin_service.py:575-582`（ban）、`:585-592`（role）、`:595-617`（plan）
- **问题**：唯一守卫是 `user_id == admin_user_id` 时 400。`ban_user` 允许封禁**另一个管理员**，`change_user_role` 允许把另一个管理员降成 `user`。没有任何「至少保留一个可用管理员」的约束；也没有行锁/事务级检查。两个管理员**并发互封**（或互降）时两条事务都能通过自己的自检并提交 → 0 个可用管理员，只能进 DB 手工修。另外这三个动作只有 `logger.info("admin_action ...")`（`ban_user:581`、`change_user_role:591`、`change_user_plan:610`），而 `delete_video`/`takedown_video`/`localize`/`retranslate` **一行日志都没有**；全仓也没有 admin 审计表（只有字幕编辑有 `subtitle_revisions`）。
- **影响**：单管理员误操作/恶意操作无追溯；极端并发下管理面自锁。考虑到内测期只有 2 个管理员（实测 `/admin/admins` 返回 2 条），这不是纯理论。
- **修复建议**：在同一个事务里 `SELECT count(*) FROM users WHERE role='admin' AND NOT is_banned FOR UPDATE`（或锁住目标行+全部 admin 行），若目标是最后一个 admin 则 409；新增 `admin_audit_logs`（actor_id/action/target_type/target_id/before/after/created_at）并在 ban/role/plan/delete/takedown/review/localize 写入。
- **验证**：读码 + 实测（当前仅 2 个管理员）；并发互封**未实测**（需两个管理员 token 且会写数据）。

#### ADM-10 分页契约不一致：3 个管理列表不返回 `total`，4 个端点 `response_model=dict`

- **位置**：`app/services/video_service.py:427-432`（`/videos/admin` 构造 `PaginatedResponse` 时不传 `total`）、`app/services/subtitle_edit_service.py:698-703`（`paginated(..., has_more=)` 无 `total`）、`app/api/v1/feedback.py:116-121`（同）；dict 端点：`videos.py:769-802`（`/score`）、`videos.py:556-567`（DELETE subtitle）、`feedback.py:78`（`GET /admin/feedback`）、`videos.py:603/618`（resegment 两个 `dict`）
- **实测**：`/videos/admin` → `{"items":[...],"total":null,...}`；`/videos/admin/{id}/subtitles/revisions` → `total:null`（且 `page=0` 会被服务层钳成 1，`page_size` 上限 200 —— 这点行为是对的）；`/admin/feedback` → 响应**没有 `total` 键**；对照 `/admin/users`、`/admin/orders`、`/admin/redemptions`、`/admin/catalog` 都有 `total`。
- **影响**：前端分页器在这两个列表上拿不到总数（`frontend/src/types/index.ts::Paginated.total` 是可选字段，所以不会崩，只是显示不了「共 N 条」）；`dict` 端点在 OpenAPI 里是 `object`，BE-07 的「所有 JSON 数据端点都有 response_model」结论在这 4 处**并不成立**（有声明但无结构）。
- **附带（排序稳定性）**：`/admin/users`（`admin_service.py:395`）、`/admin/orders`（`:713`）、`/videos/admin`（`video_service.py:427`）、`/admin/feedback`（`feedback.py:92`）、revisions（`subtitle_edit_service.py:691`）都是 `ORDER BY 单个时间列` 且**无 tiebreaker（id）**。OFFSET 分页在时间戳相同时可能跨页重复/漏行。当前 dev 数据（614 用户 `created_at` 全不重复、49 视频）不会暴露，但批量导入/播种的数据常见同秒时间戳；补 `, id` 作为次级排序即可，零成本。
- **修复建议**：统一 `paginated(..., total=)`（`/videos/admin` 已经查了 count，直接传即可）；4 个 `dict` 换成具体模型（`SubtitleRevisionListResponse`、`ResegmentResult`、`AdminFeedbackListResponse`、`VideoScoreResponse`），并在 `tests/test_response_contract.py` 里加一条「admin 端点不得用裸 dict」的遍历断言；所有管理列表的 `ORDER BY` 追加 `id`。
- **验证**：实测（响应键）+ 读码 + OpenAPI 枚举。

#### ADM-11 过滤参数对非法值静默忽略 + keyword 的 `%`/`_` 未转义（同一仓库内实现不一致）

- **位置**：`app/services/admin_service.py:365-386`（`_apply_filters`：`except ValueError: pass`）、`app/services/video_service.py:390-396`（非法 `status` 直接忽略）、`app/services/catalog_service.py:265-272`（`contains` 未转义）、`admin_service.py:514-516`（redemptions keyword，将移除）；正确对照：`video_service.py:403-406` 对 `%`/`_` 做了 `escape="\\"`
- **实测**：`/admin/users?plan=bogus` → 200 且 `total=614`（与无过滤完全一样）；`role=bogus` 同上；`/videos/admin?status=bogus` → 200 全量；`/admin/users?keyword=%` → `total=614`、`keyword=_` → `total=614`（通配符吃掉了整个 LIKE）。
- **影响**：管理员以为筛选生效其实看到的是全量（排障时最容易被骗）；搜索 `%`/`50%`/`user_name` 这类含特殊字符的关键词无法搜到预期结果。不是 SQL 注入（SQLAlchemy 参数化了），是**通配符注入 + 静默降级**。
- **修复建议**：所有枚举型 query 用 `Literal[...]`/`enum` 让 FastAPI 直接 422；字符串 `contains` 统一走一个 `like_escape()` 辅助函数（照抄 `video_service.py:404` 的写法）；对 `keyword` 加长度上限（如 100）。
- **验证**：实测（4 组请求）+ 读码。

#### ADM-12 视频标题类字段无长度上限：超过 500 字符直接 500（应为 422）

- **位置**：`app/schemas/video.py:189-211`（`VideoAdminUpdate.title/title_zh/topic_tags/admin_notes` 全是裸 `str | None`）、`:374-385`（`ReviewRejectRequest.reason` 无上限）；DB：`videos.title/title_zh/topic_tags` 均为 `varchar(500)`（`information_schema` 实测），`admin_notes`/`rejection_reason` 是 `text`
- **影响**：PATCH 501 字符的标题 → Postgres `value too long for type character varying(500)` → 未被捕获 → envelope `HTTP_500`；管理员在编辑框里粘贴一段长文本就得到一个「服务器错误」，且不知道是长度问题。
- **修复建议**：`title/title_zh/topic_tags` 加 `Field(max_length=500)`；`reason` 加 `max_length=1000`；对照 `channels.py:87-104`（已经规范地带了 max_length）与 `AdminSettingsUpdate`（也规范）。
- **验证**：读码 + DB schema 实测；写操作未实测（预期行为由 Postgres 语义保证）。

#### ADM-13 字幕 rollback 不重新校验时间轴，可制造重叠（破坏其他所有编辑路径都在守的不变量）

- **位置**：`app/services/subtitle_edit_service.py:654-667`（`rollback_subtitle`：应用 `revision.before` 的 `start_time/end_time` 后直接 `commit`，**没有** `_validate_timing`）
- **对照**：`update_subtitle:152`、`update_subtitles_batch:220-222`、`reorder:310-311`、`create:358` 全都调用了 `_validate_timing`（`_validate_timing:74-112` 检查 start<end 且不与前后邻居重叠）。回滚路径是唯一漏网。
- **影响**：若在该行编辑后、回滚前，邻居的时间被改过，回滚出来的旧时间区间会与现邻居重叠 → 播放器逐句高亮/点读出现错乱，字幕编辑器后续保存也会被 `_validate_timing` 拒绝（管理员会看到「莫名其妙 400」）。
- **修复建议**：`rollback_subtitle` 应用 `before` 后调用 `_validate_timing`；冲突时返回 409 并提示「与相邻字幕重叠，请先修正邻居时间」。
- **验证**：读码（逻辑缺口明确）；写操作未实测。

#### ADM-14 幂等/并发细节：`localize` 与 `is_demo` 的 check-then-act、settings 单例并发首建、`create_subtitle` 的 `max+1`

- **位置与问题**：
  - `app/services/video_service.py:736-760`（`localize_video_admin`）：只在 `status == processing` 时 409，**没有行锁也没有条件 UPDATE** → 两个并发请求都通过检查，都会 `localize_video.delay(force=True)`，对同一输出文件并发转码。
  - `video_service.py:484-489`（`is_demo` 唯一性）：先 `UPDATE videos SET is_demo=false WHERE is_demo=true AND id != ...`，再在内存里置位。两个管理员并发把不同视频设为 demo → 最终可能 2 个 `is_demo=true`（`get_demo_video:565-577` 用 `order_by(created_at desc).limit(1)` 兜底，所以不会报错，但「唯一示范视频」的约定被破坏，前端两处入口各自看到不同 demo）。
  - `admin_service.py:430-439`（`get_admin_settings`）：单例行不存在时 `db.add + commit`。两个并发的首次 GET/PUT（或服务刚部署第一次进设置页）→ 主键冲突 → `IntegrityError` → 500。`update_admin_settings:442-457` 也没有行锁（目前是逐字段 UPDATE，不同字段并发改安全，但阈值交叉校验读的是各自快照）。
  - `subtitle_edit_service.py:339-341`（`create_subtitle`）：`max(sentence_index)+1` 无锁 → 并发建两条同 index（无唯一约束兜底，只影响排序稳定性）。
- **影响**：都是低概率、高成本类（重复转码/双 demo/首次进设置页 500），但在「多个管理员同时操作」时会偶发，且日志里很难定位。
- **修复建议**：localize 用 `UPDATE videos SET status='processing' WHERE id=:id AND status <> 'processing'` 拿 `rowcount` 判定；demo 用一个带唯一约束的「slot」表或 `SELECT ... FOR UPDATE` 锁全表约定行；settings 用 `INSERT ... ON CONFLICT (id) DO NOTHING` + `SELECT`，或照 `home_content_service._get_or_create_*` 的 SAVEPOINT 模式；create_subtitle 加 `SELECT ... FOR UPDATE` 或先补唯一约束（注意与 reorder 的交换冲突，见讨论）。
- **验证**：读码；并发未实测。

#### ADM-15 性能/无界查询（当前数据量下可接受，规模上会先出问题）

- `GET /videos/admin` 每行都带 `external_meta` 全量 JSON + `description`（`app/schemas/video.py:153-177`）→ **实测 `page_size=100` 返回 256 KB / 17 ms**（20 行 = 113 KB）。列表页只需要几列，详情页单独取即可。
- `reorder_subtitles` / `update_subtitles_batch` 对**每一行**调 `_validate_timing`（2 条邻居查询）→ 2N 次往返；实测库里有 279 行字幕的视频，一次重排 = 558 条 SQL。可在一次查询里按 `video_id` 取全表后在内存校验。
- `GET /videos/admin/{id}/quality-reports`（`videos.py:468-478`）`.all()` 无 limit —— 重跑次数越多返回越大（管线每次重跑都会写 report）。
- `/admin/stats`：`func.date(User.last_active_at) == today`、`func.date(User.created_at)` 这类**函数列条件无法走索引**（614 行 49 ms，10 万行会全表扫，而它每 30s 被轮询一次）；`videos_by_topic`（`admin_service.py:233-246`）把**全部已发布视频的 topic_tags** 拉进 Python 聚合（用 `GROUP BY` + `unnest/string_to_table` 可在库内做，或干脆建标签关联表）。
- `GET /admin/home-content/layout` 的 `_candidate_pool` 载入**所有已发布 revision** 及其全部字幕并逐条算来源指纹（`home_content_service`，无 limit）→ 返回体随内容库线性增长（实测当前 1 KB、12 条 revision 量级）。
- `_count_online`（`admin_service.py:38-57`）用 `SCAN presence:*` 全量遍历；用户量大时每 30s 扫一遍。可改 `SCAN` 计数为 Redis `ZADD`+`ZCOUNT` 的 presence 集合。
- **建议**：列表模型裁剪（`VideoAdminListItem`）；邻居校验批量化；给 `users(last_active_at)`、`users(created_at)`、`videos(created_at)` 补索引并把 `func.date()` 改成 `>= date_trunc('day', now())` 范围条件；quality-reports 加分页/`limit`；候选池加 `limit` 或按需查询。
- **验证**：实测（响应大小/耗时）+ 读码。

#### ADM-16 GPU worker 心跳只由 launcher 脚本维护：用裸 celery 起 GPU worker 时后台永远显示「离线」

- **位置**：`app/api/v1/admin.py:47-57`（worker-status）、`app/services/video_seed_service.py:302-311`（读 `worker:gpu:heartbeat`）、`scripts/start_gpu_worker.py:25-44`（唯一写入点，60s 一次、TTL 90s）、`scripts/run_gpu_worker.ps1:36`（走该脚本）
- **问题**：心跳不是 worker 自己的信号，而是 `start_gpu_worker.py` 的守护线程写的。任何绕过该脚本的启动方式（Linux 容器里 `celery -A app.tasks.celery_app worker -Q transcription_gpu`、`nohup`、NSSM 直接指 celery）都会让 `/admin/worker-status` 恒为 `{"worker_online": false}`，进而 `POST /videos/admin/{id}/start-processing` 直接 503（`video_seed_service.py:333-336`）——即使 worker 明明在消费队列。
- **建议**：改用 Celery 的 `worker_ready`/`heartbeat_sent` 信号由 worker 自己写 Redis（或加一个每分钟由 worker 调用的内部端点），launcher 只负责进程管理；在 `backend/CLAUDE.md` 明确「GPU worker 必须用 start_gpu_worker.py」。
- **验证**：读码 + 实测（本机 `/admin/worker-status` 返回 `{"worker_online": true}`，Redis 里 `worker:gpu:heartbeat` TTL=55s，说明当前确实有 launcher 进程在打心跳；`LLEN transcription_gpu`=0 与 `gpu_queue_depth` 一致。风险在于「launcher 脚本是唯一写入者」这一结构，而不是当前值）。

#### ADM-17 `change_user_plan` 不维护 `plan_source`（授权后 provenance 仍是 trial/purchase 或 NULL）

- **位置**：`app/services/admin_service.py:595-617`；对照其它写点：`auth.py:169`（trial）、`redeem.py:202`（redeem）、`jinshuju_service.py:359`（purchase）
- **影响**：管理员给用户开 Pro 后 `plan_source` 仍是 `trial`（注册赠的）或 `NULL`；撤销 Pro 时也不清空 → `app/tasks/account_tasks.py:199` 的用户数据导出、以及将来任何按来源统计都会失真。当前无功能性读取点，所以是 P3。
- **建议**：grant 时写 `plan_source="admin"`（或 `"grant"`），revoke 时置 `None`；在 `AdminUserPlanResponse` 里返回 `plan_source` 便于核对。
- **验证**：读码 + `grep plan_source`（只有 3 个写入点 + 1 个导出点 + 测试）。

#### ADM-18 管理面敏感字段与内部错误暴露（低危，记录以备加固）

- `GET /videos/admin/{id}/status`（`app/schemas/video.py:388-402`）返回 `error_message` 原文：管线错误里可能含 yt-dlp 报错、cookies 状态、绝对路径、外链；建议截断（如 500 字符）+ 分类码，或只在 `detail` 里返回。
- `/admin/admins`、`/admin/users`、`/admin/orders` 返回完整手机号（业务需要）；没有访问审计（见 ADM-09），一旦管理员账号被盗即全量导出。建议至少给「导出/大页查询」记录审计事件。
- **未发现**：`jinshuju_payments.raw_json`、`external_meta` 之外的第三方原始 JSON 没有任何 admin 响应泄漏（`raw_json` 只在 jinshuju service 内部使用）；`/videos/admin` 的 `external_meta` 是设计内字段。
- **验证**：读码 + 实测响应字段清单（`/status`、`/admins`、`/users` 的 200 响应）。

#### ADM-19 频道管理：slug 唯一性是 check-then-act（并发 → 500），批量挂载既无上限也不校验存在性、`attached` 计数会误报

- **位置**：`app/services/channel_service.py:498-512`（`create_channel`：先 `select(Channel.id).where(slug==...)` 判重，再插入；中间没有锁也没有捕获 `IntegrityError`）、`:536-553`（`update_channel` 同样的判重）、`app/api/v1/channels.py:200-221`（`admin_attach_videos`）、`channels.py:107-108`（`ChannelAttachVideos.video_ids: list[str] = Field(..., min_length=1)`，**无 max_length**）
- **问题**：
  1. 两个管理员同时创建同一个 slug（或 A 建、B 改）→ 两边都通过 SELECT 判重 → 一方 `commit` 抛唯一约束冲突 → 未捕获 → **500**，而不是 400「slug 已存在」；
  2. `admin_attach_videos` 直接 `UPDATE videos SET channel_ref=... WHERE id IN (...)`：不存在的 id 被静默忽略，已属于该频道的 id 也会被计入 `result.rowcount`，返回的 `{"attached": N}` 是「匹配行数」而不是「实际变更行数」；`video_ids` 无上限，一次可传任意长度 IN 列表；
  3. 频道删除时只收集了 `channel_ref == id` 的视频做缓存失效（`channels.py:185`），但**首页编排里引用该频道/其视频的草稿与已发布布局**不在失效范围内（依赖首页侧自己的来源指纹，属设计约束，这里只作提示）。
- **影响**：并发创建频道的错误表现为「服务器错误」而不是可读的业务错误；挂载接口的返回数字不可信，管理员可能以为挂上了不存在的视频。
- **修复建议**：`create_channel/update_channel` 用 `try: flush/except IntegrityError: raise BadRequestError("slug 已存在")`（或用 `INSERT ... ON CONFLICT`）；`video_ids` 加 `max_length=200` 并对不存在的 id 返回 `missing_ids`；返回 `{"attached": rowcount, "missing": [...]}`；`ChannelUpdate` 里 `description` 无上限（列是 `text`，可接受）。
- **验证**：读码；并发与写操作未实测。

---

## 4. 优化机会（非缺陷，但能显著降低后续成本）

1. **管线动作统一成一个 `PipelineAction` 服务**：现在的 `start-processing/recover/retry/retranslate/localize/takedown` 各自实现「状态检查 + 锁处理 + 派发 + 状态写回」，语义四分五裂（ADM-02/03/14 都源于此）。收敛成一个 `(video, action, precondition, lock_mode, dispatch)` 表驱动实现，幂等与单飞只写一次。
2. **把「单飞/去重」做成通用依赖**：`seed` 按 URL、`retranslate` 按 video、`recover` 按 video 都需要 60s 级互斥，一个 `single_flight(key, ttl)` 上下文管理器即可全部覆盖。
3. **stats 缓存升级**：现在是 30s 全量缓存 + 无主动失效（`_STATS_CACHE_TTL`），管理员刚封人/刚改设置后数字不变。可加 `?fresh=true` 或写操作后 `DEL cache:admin_stats:*`；同时把「今日」类 KPI 的日界改为显式 UTC 说明（当前 00:00–08:00（北京）时段「今日」不含当天，符合 UTC 语义但和产品语境不符，建议前端标注「UTC 日」或改用 `Asia/Shanghai` 日界）。
4. **管理列表统一契约**：`items/page/page_size/has_more/total` 四件套 + 枚举校验 + `like_escape`，做成一个 `AdminListParams` 依赖，一次解决 ADM-10/11/15 的大部分。
5. **`_candidate_pool` 分页**：首页编排的候选池按 `video_id` 去重后分页返回，前端搜索走 `keyword`，避免随 revision 数量增长拖慢整页。
6. **`online_now` 换成有序集合**：`presence:{uid}` → `ZADD presence_z {ts} {uid}` + `ZCOUNT now-5min +inf`，O(log n) 且能顺手得到「最近活跃」列表。
7. **GPU worker 心跳归属**（ADM-16）+ **管理操作审计表**（ADM-09）这两件是纯增量基建，做完能显著提升可运维性。
8. **死管理面收敛**：见 §5，可以一个 PR 清掉 4 个无前端消费者的端点与 2 个空表端点。

---

## 5. 死代码 / 已过时管理面（与前端 `adminData.ts` 交叉核对）

| 端点 | 现状 | 证据 |
|---|---|---|
| `GET /api/v1/admin/orders` | 查 legacy `orders` 表（dev 0 行）；HEAD 前端 `orders/page.tsx` 有页面，但**工作区已删**；`adminData.listOrders` 在 HEAD 就没有 `.tsx` 调用者 | `git grep -l listOrders HEAD -- frontend/src` 仅命中 `adminData.ts`；`git ls-tree HEAD -- 'frontend/src/app/(admin)'` 里 `orders/page.tsx` 存在 |
| `GET /videos/admin/takedown-suggestions` | 后端 13 条测试覆盖，前端 `takedownSuggestions` **无调用者**（HEAD 即如此） | `git grep` 仅 `adminData.ts` |
| `POST /videos/admin/{id}/subtitles/reorder` | `reorderSubtitles` 无调用者 | 同上 |
| `PATCH /videos/admin/{id}/subtitles`（批量） | `updateSubtitlesBatch` 无调用者 | 同上 |
| `GET /api/v1/admin/catalog*`（5 条） | **没有 catalog 管理页**（HEAD 的 `(admin)` 页面清单里无 catalog），前端也没有任何函数调用 | `git ls-tree HEAD -- 'frontend/src/app/(admin)'` |
| `GET/PATCH /api/v1/admin/feedback*`、`POST /admin/announcements` | 有页面（feedback），但页面不经 `adminData` 的这些函数（直接 `adminApi` 或内联）；`listFeedbacks/updateFeedback/sendAnnouncement` 三个函数在 `frontend/src` **零引用** | `git grep` 0 命中 |
| `GET /admin/redemptions`、`/redemptions/summary` | 正被并行清理（§0.2），不计 finding | — |

> 说明：字幕编辑器（reorder/batch）在后端有完整测试，但前端没有入口——如果画布编辑器不打算恢复，这 2 个端点 + `takedown-suggestions` 可以一起下线（`test_video_takedown.py` 的 13 条测试也随之调整），否则应在文档里标注「API-only，供脚本使用」。

---

## 6. 测试覆盖缺口（管理面）

| 行为 | 现有测试 | 缺口与风险 |
|---|---|---|
| `/admin/users/{id}/ban`、`/role`、`/plan` | **0 条行为测试**（`test_response_contract.py:385-387` 只断言 response schema） | 「不能封自己/降自己」、最后管理员、`duration_days` 续期算术（已过期用户从 now 起算、未过期从 expiry 叠加）、非法 role/plan 是否 422 —— 全部无护栏。ADM-09/17 属此类。 |
| 统计口径 | `test_admin_panel.py::TestAdminStatsEnhanced` 只断言「键存在且 `>= 0`」；`test_presence.py` 只测 `redeems_today`（正被删） | **无法发现 ADM-05**：`pro_users` 含过期用户时断言照样通过。建议加「造 1 个过期 pro 用户 → pro_users 不应包含它」的测试。 |
| `/admin/orders` | 0 条 | 空表端点无测试（也无人调用，见 §5） |
| 管线动作 | `test_pipeline_resume.py`(4)、`test_pending_processing.py`、`test_pipeline_watchdog.py`(10) 覆盖正常路径 | 没有「并发两次 recover/retry」「对正在 processing 的视频 retranslate」「连点两次 seed 只应建一行」的测试（ADM-02/03/04） |
| 重断句/回滚 | `test_subtitle_resegment.py`(4)、`test_subtitle_revisions.py`(5) | 只断言字幕数量/文本，**没有副作用断言**（`sentence_favorites` 是否被删、`subtitle_revisions` 是否被清、`vocabulary.subtitle_id` 是否变 NULL）——ADM-01 完全无护栏 |
| 公告广播 | `test_feedback.py`(9) 用 2 个用户 | 无批量/事务/规模测试；无「重复广播是否幂等」测试 |
| 设置 | `test_admin_panel.py`(8) 覆盖默认值/部分更新/阈值校验 | 无并发首建、无「字段无消费者」的守卫（可加静态测试：`AdminSettingsUpdate` 的每个字段必须在 `app/` 里至少有一个非 echo 读取点） |
| 过滤/分页 | 少量 | 无「非法枚举 → 422」「keyword 含 `%` 不应匹配全部」的测试（ADM-11）；无「分页 total 必须存在」的门禁（ADM-10） |
| 前端契约 | `tests/test_response_contract.py`(36) 钉了很多 schema | 但 4 个 `dict` 端点绕过了断言；`frontend/src/types/index.ts` 的 `AdminStats`/`AdminSettings` 与后端 schema 没有自动比对 |

**建议的新增测试（按性价比）**：① ban/role/plan 三件套（含自操作、最后管理员、过期用户续期）；② stats 口径（过期 pro 不计入）；③ seed 连点去重；④ resegment 副作用（收藏/审计/词汇）；⑤ 非法枚举 422 + keyword 转义；⑥ admin 端点不得返回裸 `dict`（遍历 OpenAPI）。

---

## 7. 未能验证 / 无法验证

1. **所有写操作**（§0.3）——审计硬约束禁止 POST/PATCH/DELETE。ADM-02/03/04/09/12/13/14 的行为结论均来自代码 + DB schema 推理，未实测。
2. **并发场景**：互封管理员、并发 localize、并发 retranslate、并发首建 settings 行 —— 需要多令牌/多线程写操作，未执行。ADM-09/14 的「可同时生效」是代码推理。
3. **管线/Celery 行为**：本轮没有触发真实转写/回调（只看到 GPU launcher 心跳在线），`recover/retry/retranslate` 的实际派发、锁竞争、`finalize_video` 的 `_is_step_done` 行为未运行验证（历史发现 BE-11/BE-12 已单独记录，本次不重复报）。
4. **生产边缘限流**（nginx）不在本次范围（历史 BE-05）。
5. **`redeem`/退役表清理后的最终形态**：审计期间还在变（§0.1），我只保证「HEAD 69eb4c7 的结论」与「并行清理不与我重复」。
6. **未跑的门禁**：全量 `pytest`、`ruff`、`mypy`、`alembic check`、`pip-audit`（只读审计，时间用于探测）。§6 的测试数量是静态统计（按 `def test_` 计数），不代表全部通过。
7. **`ADM-01` 的真实数据损失规模**：dev 的 `sentence_favorites=0`，无法量化生产影响；FK 级联行为是 DB schema 事实（不依赖数据量）。

---

## 8. 附录：证据与复现命令

### 8.1 本次用到的只读命令

```powershell
# 路由清单（HEAD）：68 条 /admin + 2 条 seed，逐条核对鉴权/限流/response_model
cd C:\Users\Administrator\Speaking
$env:PYTHONUTF8=1
backend\.venv\Scripts\python.exe .tmp-diag\backend-audit\gen_table.py     # 生成清单表
backend\.venv\Scripts\python.exe .tmp-diag\backend-audit\auth_ast.py      # AST 断言：/admin 路由都有 get_admin_user + @rate_limit
# OpenAPI 枚举（live）
curl.exe -s http://127.0.0.1:8000/openapi.json -o .tmp-diag\backend-audit\openapi.json
backend\.venv\Scripts\python.exe .tmp-diag\backend-audit\inventory.py
# 只读 HTTP 探测（管理 token）
backend\.venv\Scripts\python.exe .tmp-diag\backend-audit\probe.py         # 结果在 probes.json

# 统计口径对照
backend\.venv\Scripts\python.exe -c "…login…; /api/v1/admin/stats"          # 结果在 stats_full.json
docker exec speaking-db-1 psql -U seeword -d seeword -t -A -c "
  select count(*) filter (where plan='pro') as pro_all,
         count(*) filter (where plan='pro' and plan_expires_at < now()) as pro_expired
  from users;"                                                             # 611 / 327

# 级联删除证据（ADM-01）
docker exec speaking-db-1 psql -U seeword -d seeword -t -A -c "
  select tc.table_name, rc.delete_rule from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on tc.constraint_name=ccu.constraint_name and tc.table_schema=ccu.table_schema
  join information_schema.referential_constraints rc on rc.constraint_name=tc.constraint_name
  where tc.constraint_type='FOREIGN KEY' and ccu.table_name='subtitles';"
# → sentence_favorites CASCADE / subtitle_revisions CASCADE / vocabulary SET NULL / speaking_attempts,shadowing_attempts SET NULL

# seed 去重缺口（ADM-04）：source_url 只有非唯一索引
docker exec speaking-db-1 psql -U seeword -d seeword -t -A -c "
  select indexdef from pg_indexes where tablename='videos' and indexname='ix_videos_source_url';"
```

### 8.2 关键只读探测结果（2026-10-26 12:12–12:22 -06:00）

| 探测 | 结果 |
|---|---|
| `GET /admin/stats?days=30` | `total_users=614`、`pro_users=611`、`pro_expired_count=327`、`funnel.pro=611`、`users_by_plan=[{pro:611},{free:3}]`、`recent_activity` 8 条全 `signup` |
| `GET /admin/users?page=1&page_size=2` | `total=614`（与 items 一致） |
| `?plan=expired` / `?plan=pro` | `total=327` / `total=611` |
| `?plan=bogus` / `?role=bogus` | `200`，`total=614`（静默忽略） |
| `?keyword=%` / `?keyword=_` | `200`，`total=614`（通配符注入） |
| `?page=0` | `422 VALIDATION_ERROR`（正确） |
| `GET /videos/admin?page_size=2` | `total=null`、`has_more=true` |
| `?status=bogus` | `200` 全量（静默忽略） |
| `GET /videos/admin/{id}/subtitles/revisions?page=0` / `page_size=100000` | `200`，`page→1`、`page_size→200`、`total=null`（服务层钳制正确） |
| `GET /admin/feedback?page_size=2` | `200`，**无 `total` 键** |
| `GET /admin/orders` | `200`、`total=0` |
| `GET /admin/admins` | 2 个管理员（含完整手机号） |
| `GET /admin/settings` | 13 字段（其中 6 个无消费者，见 ADM-08） |
| 无 token / refresh token 打 `/admin/stats` | `401 HTTP_401` / `401 "Invalid token type"` |
| 32×`GET /admin/admins` | `30×200 + 2×429`（限流生效） |
| `GET /videos/admin?page_size=100` | `200`、**256 KB**、17 ms（`external_meta` 全量） |

原始 JSON：`.tmp-diag/backend-audit/probes.json`、`stats_full.json`、`routes_admin.json`、`routes_runtime.json`；HEAD 源码副本：`.tmp-diag/backend-audit/head/`。这些是临时证据，未入库。

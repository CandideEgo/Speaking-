# 后端修复 B：channels / feedback / 公告 / video_service 管理面板健壮性（2026-10-26）

任务：`task-7`「Backend fixes B: channels/feedback/announcements/video-service admin robustness」
分支：`redesign`（工作树，未提交）；负责人：admin-fixer（backend 并行修复 B）
审计输入：[`backend.md`](backend.md) 的 ADM-07 / ADM-10 / ADM-14 / ADM-15 / ADM-19，清理上下文见 [`backend-removal.md`](backend-removal.md)。

## 1. 结论

| 发现 | 状态 | 一句话 |
|---|---|---|
| ADM-19 频道 slug 并发 / 批量挂载 | ✅ 已修 | slug 唯一约束冲突 → 400「slug 已存在」；`video_ids` 上限 200；`attached` 改真实变更数并返回 `missing_ids` |
| ADM-10 feedback 列表裸 dict / 无 total | ✅ 已修 | typed `PaginatedResponse[AdminFeedbackRow]`，含 `total`；`created_at, id` 稳定排序 |
| ADM-07 公告在请求内全表 fan-out | ✅ 已修 | 请求只数人 + 入队；新 Celery 任务按 500/批 bulk insert，提交后 best-effort WS；保留未读去重语义 |
| ADM-14 `localize` / `is_demo` check-then-act | ✅ 已修 | `localize` 改条件 UPDATE + `rowcount`；`is_demo` 授权用 PG 事务级 advisory lock 串行化 |
| ADM-10 `/videos/admin` 无 total | ✅ 已修 | 传真实 count + `created_at, id` 稳定排序（响应结构不变） |
| ADM-15 低风险项 | ✅ 部分 | 列表稳定排序 tiebreaker（频道列表/公开频道/封面回退/频道详情/feedback/videos admin） |
| ADM-16 / ADM-09 审计表 / 公告实体表 / ADM-15 大性能项 | ⏸ deferred | 见 §3，均需跨文件/迁移，超出本任务边界 |

验证（精确数字）：定向 **161 passed**（6 个测试文件，205.26s）；消费者侧 **52 passed**（4 个文件，30.57s）；`ruff check app tests` **All checks passed!**；我的 13 个文件 `ruff format --check` **13 files already formatted**。全量 pytest 未跑（并行队友仍在改，Lead 收口时统一跑）。PG 真实库探针（rollback，无写入）与 dev 后端实时 OpenAPI 契约均已核对，见 §4。

## 2. 修复明细

### 2.1 ADM-19 频道管理：slug 并发 500、批量挂载谎报与无上限

**问题**：`create_channel` / `update_channel` 先 SELECT 判重再 INSERT/UPDATE，两个管理员同时提交同一 slug 时都通过判重，后提交者撞唯一索引 → 未捕获 `IntegrityError` → 500 envelope。`admin_attach_videos` 的 `UPDATE ... WHERE id IN (...)` 把「已属于该频道的行」也算进 `result.rowcount`，不存在的 id 被静默忽略，`video_ids` 无长度上限。

**改动**：

- `app/services/channel_service.py`
  - 新增 `_slug_exists()`（仅快速路径，注释写明唯一索引才是权威）与 `_integrity_conflict_message()`（按错误原文区分 slug / upstream_channel_id 冲突）。
  - `create_channel` / `update_channel`：`flush()` 包 `try/except IntegrityError` → `rollback()` → `BadRequestError("slug 已存在: …")`（上游 ID 冲突则「上游频道 ID 已被占用」）。不再可能冒出 `HTTP_500`。
- `app/api/v1/channels.py`
  - `ChannelAttachVideos.video_ids` 加 `max_length=200`（大 IN 列表的单请求事务上限）。
  - `admin_attach_videos` 重写：先去重保留顺序 → 一次 `SELECT id, channel_ref` 拿到存在性与当前归属 → `changed_ids` = 归属确实要变的行 → 带 `channel_ref IS NULL OR channel_ref != :id` 条件的 UPDATE，`attached` 取 `rowcount`（驱动不提供时回退预查询值）；`missing_ids` 返回给前端；缓存失效只针对真实变更的视频。
- `app/schemas/channel.py`：`ChannelAttachVideosResponse` 增加 `missing_ids: list[str] = []`（additive，前端旧字段不变）。

**测试**（`tests/test_channels_api.py`，新增 4 条）：

- `test_admin_create_channel_slug_race_returns_400_not_500`：monkeypatch 快速判重恒 False（模拟两请求都过判重）→ POST → 400 `BAD_REQUEST` + 「slug 已存在」，不是 500。
- `test_admin_update_channel_slug_race_returns_400_not_500`：PATCH 改 slug 撞已有 slug（同样绕过快速判重）→ 400。
- `test_admin_attach_videos_reports_missing_and_only_counts_real_changes`：目标频道内已有视频 + 待迁移视频 + 重复 id + 不存在 id → `{"attached": 1, "missing_ids": ["no-such-video"]}`，两个视频最终归属正确。
- `test_admin_attach_videos_rejects_unbounded_batch`：201 个 id → 422。

### 2.2 ADM-10 `GET /admin/feedback`：裸 dict / 无 total / 排序不稳定

**改动**：

- `app/schemas/feedback.py`：新增 `AdminFeedbackRow(AdminFeedbackResponse)`（形状与 PATCH 响应一致，命名类型让 OpenAPI 有真实契约）；`AnnouncementResponse` 增加 `queued: bool = False`（§2.3）。
- `app/api/v1/feedback.py`：`response_model=PaginatedResponse[AdminFeedbackRow]`；先算 `count` 得 `total`，再 `ORDER BY created_at DESC, id DESC` + `OFFSET/LIMIT`，返回 `paginated(..., total=total)`（`has_more` 由 total 推导）。用户姓名脱敏逻辑保持原样（一次批量查 User）。

**测试**（`tests/test_feedback.py`）：

- `test_admin_list_feedback_returns_typed_envelope_with_total`：键集 = `has_more/items/page/page_size/total`，`total==3`、`page/page_size/has_more` 与第二页一致。
- `test_admin_feedback_list_is_typed_in_openapi`：`$ref` 以 `PaginatedResponse_AdminFeedbackRow_` 结尾；公告端点 `$ref` 以 `AnnouncementResponse` 结尾且含 `queued`（题目要求的「announcement 响应仍 typed」）。
- `test_admin_feedback_order_has_id_tiebreaker`：两条 `created_at` 完全相同的反馈，`page_size=1` 翻两页必须拿到两个不同 id。
- `tests/test_response_contract.py::test_admin_feedback_dict_endpoint` 按 Lead 授权**只改这一个函数**（重命名 `test_admin_feedback_list_is_typed_with_total`）：断言信封键集含 `total`、`total==0`。该文件同时被 payments-builder 使用，合并时注意。

### 2.3 ADM-07 公告广播：请求内全表逐条 INSERT + WS → Celery 分块批量

**问题**：`POST /admin/announcements` 在一个 HTTP 事务里 `select(User)` 全表进内存，对每个用户 `SELECT 去重 + INSERT + flush + WS 推送`，1 万用户 = 1 万次往返；反向代理 60s 超时/客户端断开还可能让事务被取消（一半人收到）。

**改动**：

- `app/services/notification_service.py`
  - 删除旧的请求内 `broadcast_announcement()`。
  - 新增 `count_announcement_recipients(db)`（请求路径只数人）。
  - 新增 `fan_out_announcement(db, *, title, message, related_url, chunk_size=ANNOUNCEMENT_CHUNK_SIZE=500)`：keyset 分页（`User.id > last_id`）每 500 人一批；每批一条多值 `insert(Notification)`（id 客户端生成，无需 RETURNING）；**每批 commit 之后**再 best-effort WS 推送（推送失败不回滚已落库行）；带 `related_url` 时先查同 `(user, announcement, related_url, is_read=False)` 的未读行原地更新（title/message/data/created_at），保持旧 `create_notification` 的去重语义；不带 `related_url` 时每次广播都新增。
  - 新增 `_announcement_stub()`：为 WS 推送组装瞬时 `Notification`（不加入 session）。
- `app/tasks/notification_tasks.py`（**新建**）：`app.tasks.notification_tasks.broadcast_announcement`（默认 `celery` 队列，`soft_time_limit=280 / time_limit=300`），同步壳 `run_async(_broadcast_announcement_async(...))`；异步实现可注入 `chunk_size` 供测试。
- `app/tasks/celery_app.py`：仅追加 `import app.tasks.notification_tasks` 一行（该文件的其余 diff 来自 backend-remover 的清理，不是本任务改动）。
- `app/api/v1/feedback.py`：`POST /admin/announcements` 改为「数人 + `broadcast_announcement.delay(...)` + 返回 `{queued: true, notified_count: 人数, title, message}`」，保留前端已用的三个字段。

**测试**（`tests/test_feedback.py`）：

- `test_broadcast_announcement_only_enqueues_task`：请求前后用户通知列表都没有 announcement 行（请求路径无逐用户 INSERT）；`_mock_celery` 只记录 **1 次** `BROADCAST_ANNOUNCEMENT_TASK_NAME` 派发，且 kwargs 为 `{title, message, related_url}`；响应 `queued=True`、`notified_count>=2`。
- `test_announcement_task_bulk_inserts_one_statement_per_chunk`：7 个用户、`chunk_size=3` → 处理 7 人、落 7 行、`ceil(7/3)=3` 条 `INSERT INTO notifications` 语句（用 `before_cursor_execute` 事件计数），证明是分块批量而不是逐用户 N+1。
- `test_announcement_task_preserves_unread_dedup_semantics`：同 `related_url` 二次广播行数不变、内容被更新；把一行标已读后再广播 → 该用户新增一行（总数 +1），已读行保留旧标题；无 `related_url` 时两次广播 = 2×用户数行。

### 2.4 ADM-14 `video_service.py`：localize 双派发、is_demo 双 demo

**改动**（`app/services/video_service.py`）：

- `localize_video_admin`：不再「读 status → if」。改为一条条件 UPDATE：
  `UPDATE videos SET status='processing', video_url_*=NULL, error_message=NULL, processing_step='downloading', processing_progress=? WHERE id=:id AND status != 'processing'`，
  用 `rowcount` 判定：0 → `rollback()` 后用 `db.get` 区分 404 与 409，只有真正翻转状态的那一次请求才 `commit` 并 `localize_video.delay(force=True)`。
- `is_demo` 唯一性：新增 `_serialize_demo_grant()` —— 在 Postgres 上取事务级 advisory lock（`pg_advisory_xact_lock(0x5EE0D3E3)`，由同一次 commit 释放），把「清掉上一个 demo + 设置新 demo」串行化；SQLite（测试/本地）单写者，函数为 no-op。注释写明「单行不变量无法靠行锁表达，所以用 advisory lock」。
- 顺带把 `/videos/admin` 列表的 `total` 与排序修了（见 2.5）。

**测试**（`tests/test_videos.py`）：

- `test_localize_second_request_is_blocked_and_dispatches_once`：第一次 200 且只派发 1 次，第二次 409 且派发数仍为 1。
- `test_localize_guard_is_a_conditional_update`：捕获真实 SQL，确认发出的唯一 UPDATE 带 `status` 与 `!=` 谓词（并发下两请求都读到 ready 时，只有先 UPDATE 成功者派发）。
- `test_localize_nonexistent_returns_404`：条件 UPDATE 未命中后仍能区分 404/409。
- `test_demo_grant_takes_the_serialization_lock`：`is_demo=True` 时 `_serialize_demo_grant` 被 await 一次，普通字段 PATCH 不取锁（wiring 断言）。
- `test_serialization_lock_is_a_noop_off_postgres`：SQLite 下调用不抛错、不发 PG 专用 SQL。
- 既有 `tests/test_demo_video.py::test_admin_toggle_clears_previous_demo` 继续覆盖「后设置的 demo 胜出、最终只有一个」。

### 2.5 ADM-10 `/videos/admin`：total 传真实 count + 稳定排序

**改动**（`app/services/video_service.py::list_all_videos`）：把已算出的 `total` 传进 `PaginatedResponse`（原来构造时漏传 → `total: null`）；`ORDER BY created_at DESC, id DESC`；`limit(page_size + 1)` 的取巧改为 `limit(page_size)`（`has_more` 已由 total 推导）。响应结构（`PaginatedResponse[VideoAdminResponse]`）不变，前端旧逻辑仍可用。

**测试**（`tests/test_videos.py`）：

- `test_list_reports_real_total`：3 条视频、`page_size=2` → `total==3`、`has_more=True`。
- `test_list_order_has_id_tiebreaker`：3 条视频强制同一 `created_at`，两页拼起来 id 不重不漏。

### 2.6 ADM-15 低风险项：稳定排序 tiebreaker

只做了零契约风险的部分（大性能项见 §3）：

- `channel_service.list_admin_channels`：`ORDER BY sort_order, name, id`。
- `channel_service.list_public_channels`：SQL 排序与 Python 排序键都补 `id`（`(0, sort_order, name, id)` / `(1, -count, name, id)`）。
- `channel_service._latest_covers`：`ORDER BY channel_ref, created_at DESC, id DESC`（同秒封面不再抖）。
- `channel_service.get_channel_detail` 的视频分页：`ORDER BY created_at DESC, id DESC`。
- `list_admin_feedback`（§2.2）与 `/videos/admin`（§2.5）的 tiebreaker。

## 3. Deferred（本轮不做 / 不在边界）与理由

| 项 | 理由 |
|---|---|
| **ADM-16 GPU worker 心跳归属** | 写入点在 `scripts/start_gpu_worker.py`，读取点在 `api/v1/admin.py` + `video_seed_service.py`（均不在本任务文件边界）；属纯增量基建，需改运维脚本和文档，建议单独任务。 |
| **ADM-09 持久管理审计表** | 需要新表 + Alembic 迁移 + `admin_service.py` 全链路写入；「最后管理员保护」由 task-5 在 `admin_service.py` 处理。审计表 deferred。 |
| **ADM-07 公告实体表 + 已读统计** | 需要新表（announcements + 用户已读）、迁移、公共读取端点和前端未读入口；本轮已把 fan-out 移出请求路径并保留 Notification 语义，属于控制影响面后的第一阶段。 |
| **ADM-15 大性能项** | `/videos/admin` 列表裁剪 `external_meta/description`（契约变更 + `schemas/video.py` 正被 task-6 改）、`quality-reports` 加 limit（`api/v1/videos.py`，task-6 边界）、stats 函数列条件改可索引范围（`admin_service.py`）、`videos_by_topic` 库内聚合、home-content 候选池分页、presence 换 ZSET。逐项都需要跨文件/契约决策，deferred 给后续专项。 |
| **ADM-10 其余 3 个 `response_model=dict`** | `DELETE subtitle`、`resegment` / `resegment/rollback`、`/videos/admin/{id}/score` 全在 `api/v1/videos.py` + `subtitle_edit_service.py`（task-6 边界，其任务已包含 typed `ResegmentResult` 与 revisions `total`）。 |
| **ADM-11 管理列表非法枚举 422 / keyword LIKE 转义** | `admin_service.py` / `catalog_service.py` 边界，task-5 已覆盖 admin users 部分。 |
| **`video_ids` 元素长度上限** | id 是 36 字符 UUID；列表已限 200 个，单元素长度无实际风险，未加。 |
| **自动建频道 `ensure_channel_for` 的 slug check-then-act** | 依赖 `channels.upstream_channel_id` 唯一索引 + 既有 Celery 重试注释兜底，不在 ADM-19 的「管理端点」范围；改它需要独立设计（自动命名冲突回退），未动。 |

## 4. 验证证据（真实命令与输出）

环境：中文 Windows，`backend/` 下、`PYTHONUTF8=1`、`PYTHONPATH=.`、`backend/.venv/Scripts/python.exe`。

### 4.1 Lint / format

```
> python -m ruff check app tests
All checks passed!

# 我边界内 13 个文件（含只改一个函数的 test_response_contract.py）
> python -m ruff check <13 files>
All checks passed!
> python -m ruff format --check <13 files>
13 files already formatted
```

已知工作区状态（与本任务无关，留给 Lead 收口）：`ruff format --check app tests` 当前还会点名
`tests/test_admin_panel.py`、`tests/test_admin_payments.py`（payments-builder 正在改的文件，我未触碰）。

### 4.2 定向测试

```
> pytest tests/test_channels_api.py tests/test_feedback.py tests/test_videos.py \
    tests/test_demo_video.py tests/test_response_contract.py tests/test_notifications.py -q
161 passed, 11 warnings in 205.26s (0:03:25)
```

```
> pytest tests/test_admin_panel.py tests/test_admin_quality_inspection.py \
    tests/test_browse_feed.py tests/test_discovery_api.py -q
52 passed in 30.57s
```

新增/重写回归用例 **17 条**：channels 4、feedback 6、videos 7；另按 Lead 授权重写 `test_response_contract.py` 中的 1 条契约断言。warning 均为测试环境 fake Redis 没有 `publish` 时 WS 推送 best-effort 日志的 structlog 提示，不影响断言。

全量 `pytest tests/` **未执行**：工作区有并行队友在改 `subtitle_edit_service.py` / `admin_service.py` / `schemas/video.py` / `test_admin_payments.py`，全量结果会被并行中间态污染；按任务约定由 Lead 收口统一跑。

### 4.3 Postgres 真实库探针（全部 rollback，无写入）

dev 库（`c3d4e5f6a7b8` head）上验证测试套件（SQLite）覆盖不到的 PG 专用路径：

```
conditional-update rowcount: 0            # 条件 UPDATE 在真实 PG 上返回 0（未命中）
bulk rows prepared: 3                     # insert(Notification), [dict,...] 多值批量形状可用
PG probe OK (all rolled back)             # _serialize_demo_grant 的 pg_advisory_xact_lock 成功
```

### 4.4 dev 后端实时 OpenAPI（`http://127.0.0.1:8000`，--reload 已重载，只读 GET）

```
feedback list ref:      #/components/schemas/PaginatedResponse_AdminFeedbackRow_
announcements ref:      #/components/schemas/AnnouncementResponse
announcement props:     message,notified_count,queued,title
attach ref:             #/components/schemas/ChannelAttachVideosResponse  (attached, missing_ids)
attach request schema:  video_ids: array, minItems 1, maxItems 200
feedback envelope:      items/page/page_size/has_more/total
```

## 5. 风险与集成注意（给 Lead / 部署）

1. **Celery worker 必须重启才会认识新任务**。本任务按约定没有重启任何服务：dev 里 NSSM 托管的云端 worker 仍在跑旧代码，重启前从 `/admin/announcements` 入队的消息会以 unregistered task 结束（公告不会送达）。发版流程里确认 backend 与 worker 都换新镜像/重启后再让管理员使用公告功能（生产是容器重建，天然满足）。
2. **公告任务分批提交 ≠ 单事务**。worker 在任务中途被杀并重投时，`related_url=None` 的广播可能给已处理用户再插一行（旧实现是单事务全无/全有）。根治需要公告实体表 + `broadcast_id` 唯一键（§3 deferred）。带 `related_url` 的广播天然幂等（原地更新）。
3. **`notified_count` 语义变化**：现在是「入队时统计的用户数」，不是「实际写入数」；同时响应新增 `queued: true`。前端 toast 文案仍是「公告已发送给 N 位用户」，可后续改为「已提交，正在发送」——前端文件不在本任务边界，未改。
4. **WS 推送仍是每用户一次**（只是移出请求路径）。1 万用户时任务耗时会到秒级到十秒级，WebSocket 在线率低时无实际收益；彻底方案是公告实体 + 客户端拉取（与 §3 defer 合并处理）。
5. **`is_demo` 串行化只保证在 Postgres 上成立**；SQLite（测试/本地）是单写者且函数 no-op。若未来迁库需重审 `_serialize_demo_grant`。advisory lock key `0x5EE0D3E3` 为固定常量，修改它会让新旧代码在滚动发布期间互不互斥（发布窗口内不要改）。
6. **`admin_attach_videos` 的 `attached` 依赖驱动 rowcount**；SQLite 与 Postgres 都已验证，rowcount 不可用时回退到预查询的变更集（仍不会把 no-op 算进去）。
7. **频道删除的首页编排缓存不在失效范围**（ADM-19 第 3 点）：首页 editorial 用来源指纹自失效，属设计约束，本次未改，也未新增失效（保持原行为）。
8. **`test_response_contract.py` 是我的单点跨边界改动**（Lead 已授权，仅 `test_admin_feedback_dict_endpoint` 一个函数）；payments-builder 同时在改该文件，合并时若冲突，保留「feedback 列表键集含 total」这一条即可。
9. **`backend/app/tasks/celery_app.py` / `video_service.py` 的 diff 里混有 backend-remover 的清理改动**（删 `redeem_tasks`/`report_tasks` import、删 `SpeakingAttempt` 清理），那是已完成的清理工作，不是本任务重复修改。

## 6. 复核命令速查

```powershell
cd backend
$env:PYTHONUTF8=1; $env:PYTHONPATH='.'
.\.venv\Scripts\python.exe -m ruff check app tests
.\.venv\Scripts\python.exe -m ruff format --check app tests
.\.venv\Scripts\python.exe -m pytest tests/test_channels_api.py tests/test_feedback.py `
    tests/test_videos.py tests/test_demo_video.py tests/test_response_contract.py tests/test_notifications.py -q
# dev 后端契约（只读）
(Invoke-RestMethod http://127.0.0.1:8000/openapi.json).paths.'/api/v1/admin/feedback'.get.responses.'200'
```

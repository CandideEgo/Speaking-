# 后端修复 A：管线与字幕编辑数据安全（2026-10-26）

任务：`task-6`「Backend fixes A: pipeline + subtitle safety」
分支：`redesign`（工作树，未提交）；负责人：pipeline-fixer（backend 并行修复 A）
审计输入：[`backend.md`](backend.md) 的 ADM-01 / ADM-02 / ADM-03 / ADM-04 / ADM-10(revisions) / ADM-12 / ADM-13 / ADM-14 / ADM-18；清理上下文见 [`backend-removal.md`](backend-removal.md)。

## 1. 结论

| 发现 | 状态 | 一句话 |
|---|---|---|
| ADM-01 重断句静默删除用户数据（**P1**） | ✅ 已修 | 重断句/回滚前捕获 `sentence_favorites`/`subtitle_revisions`/`vocabulary.subtitle_id`，按时间重叠重映射到新字幕；快照 JSON 保存映射与无法映射行；`ResegmentResult` 返回逐项计数，不再静默丢行 |
| ADM-01 同源：单行删除字幕级联删收藏/历史 | ✅ 已修 | 默认返回 409 + `affected_favorites`/`affected_revisions`，`?force=true` 才执行；typed `SubtitleDeleteResult`；favorites/revisions/vocabulary 的级联改为显式 SQL（Postgres 与 SQLite 行为一致） |
| ADM-02 `retranslate` 无守卫 / 先清空后派发 | ✅ 已修 | 状态守卫（processing/ready_subtitles/pending_processing → 409）、engine 白名单（非法 422）、Redis 单飞锁（300s）、派发失败恢复已清空的 `text_zh` 与视频状态（503） |
| ADM-03 `recover`/`retry` 无条件删活锁 | ✅ 已修 | 用 `step_started_at`（回退 `processing_started_at`）+ 当前步骤看门狗预算 ×1.2 判断：活锁 → 409 且不删锁；只有陈旧锁才清；恢复/重试加 60s 单飞键 |
| ADM-04 `/videos/seed`、`/seed-full` 去重缺口 | ✅ 已修 | 去重覆盖 pending_processing/processing/ready_subtitles/ready（error 仍可重试）；URL 级 Redis 锁 `seed:{sha1}`（120s，SET NX）+ `finally` 释放；连点/并发只建一行、只派发一次 |
| ADM-13 `rollback_subtitle` 不校验时间轴 | ✅ 已修 | 回滚应用 `before` 后调用 `_validate_timing`；与现邻居重叠 → 409 且回滚事务（不提交半状态） |
| ADM-14 `create_subtitle` 的 `max+1` 无锁 | ✅ 已修 | 分配前 `SELECT … FOR UPDATE` 锁视频行（`lock_video_row`），并发追加不再产生重复 `sentence_index` |
| ADM-12 标题类字段无长度上限 | ✅ 已修 | `VideoAdminUpdate` 的 title/title_zh/topic_tags `max_length=500`、`ReviewRejectRequest.reason` `max_length=1000` → 超长 422 而不是 Postgres 500 |
| ADM-10 revisions 列表无 `total`；`/score` 裸 dict | ✅ 已修 | revisions 返回 `total`（含 `id` 二级排序，翻页稳定）；`/videos/admin/{id}/score` 收成 typed `VideoScoreResponse`（字段不变） |
| ADM-18 管理状态接口回显完整内部报错 | ✅ 已修 | `VideoStatusResponse.error_message` 在 schema 边界截断到 500 字符（DB 仍保留全文供排障） |
| ADM-01 根治方案（收藏加 video/time/text 快照列、失效态） | ⏸ deferred | 需新增列 + 迁移（超出本任务文件边界，且会改用户数据模型）；当前实现已做到「不静默丢失 + 可回滚恢复」 |
| ADM-10 `/videos/admin` 列表 `total` | ➖ 不在本任务 | 由 task-7（`video_service.py`）负责；本任务未触碰该文件 |
| ADM-04 `videos(source_url, is_official)` 唯一索引 | ⏸ deferred | 需迁移 + 先清理历史重复行；当前用「去重查询 + URL 锁」达到同等效果 |

验证摘要：`ruff check app tests` **All checks passed**；`ruff format --check app tests` **321 files already formatted**；改动文件 mypy **无新增 file:code 对**（仅剩基线既有 `app/services/video_seed_service.py:misc`）；定向 **53 passed**（本任务 3 个测试文件）+ 关联回归批次 **240 passed**（18 个文件）；**全量 `pytest tests/ -q` → 1460 passed, 14 skipped, 0 failed**（748.06s，30 warnings；14 skip 均为本机未设 `PG_TEST_URL` 的 `integration` 用例）。无迁移、无模型变更。

## 2. 修复明细

### 2.1 ADM-01 重断句（resegment）与回滚：保留并重映射用户数据

**问题**（审计 §ADM-01）：`resegment_video` 先 `db.add(snapshot)` 再 `for s in subs: await db.delete(s)`。由于 DB FK：

| 子表 | FK ondelete | 原后果 |
|---|---|---|
| `sentence_favorites.subtitle_id` | CASCADE | 全体用户对该视频的原句收藏被删，回滚不恢复 |
| `subtitle_revisions.subtitle_id` | CASCADE | 该视频字幕编辑审计归零 |
| `vocabulary.subtitle_id` | SET NULL | 词条来源句链断 |

`rollback_resegment` 只重建字幕行（且用新 UUID），被级联删掉的数据永远回不来。

**实现**（`app/services/subtitle_edit_service.py` 新增 ADM-01 辅助段 + 重写两个函数）：

1. **捕获** `_capture_subtitle_user_data(db, video_id, subtitle_ids)`：把将要被替换的字幕行上的 favorites / revisions / vocabulary 以可 JSON 序列化的 dict 捕获（只读，不改数据）。
2. **映射** `_map_interval_to_segment(start, end, segments)`：
   - 优先「包含旧 start 的 `[start,end)` 新分段」（多个命中取最短 span）；
   - 否则取「时间重叠最大」的分段；
   - 完全没有重叠 → `None`（**不猜、不丢**，进入 unmatched）。
   `_build_remap_plan()` 把每条捕获行落到 `new_subtitle_id`，并把两类「不能保留原样」的行单独记账：
   - `favorites_merged`：同一用户的两条旧收藏映射到同一条新分段，被 `(user_id, subtitle_id)` 唯一约束合并（不是丢失，原行仍在快照里）；
   - `*_unmatched`：无时间重叠，保留在快照 JSON 中。
3. **落库顺序**（保证 Postgres FK 始终有效，同时不依赖 SQLite 的外键行为）：
   `插入新字幕行（预生成 id）→ flush → UPDATE favorites/revisions/vocabulary 指向新 id → flush → 显式删除/置空仍挂在旧行上的数据（镜像 CASCADE/SET NULL）→ 删除旧字幕行 → flush → commit`。
4. **快照 JSON v2**：`subtitle_resegment_snapshots.segments_json` 从「纯列表」升级为
   `{"version":2, "segments":[旧行(含 id)], "mapping":{旧id→新id|null}, "user_data":{"captured":..., "lost":...}}`。
   `_parse_snapshot_payload()` 同时接受 v1（纯列表）与 v2，**旧快照仍可回滚**（只是没有用户数据恢复信息）。选 JSON 内升级而不是加列，是因为加列要迁移，而本任务不拥有迁移文件。
5. **回滚** `rollback_resegment`：
   - 捕获**当前**（重断句后）字幕上的用户数据 → 用同一映射器映回「快照恢复行」（当前行也可能包含重断句后新增的收藏，一并保留）；
   - 从快照 `user_data.lost` 里把当初无法映射的行**重新插回**（收藏/编辑历史按原 id、原时间；词汇来源句仅在仍为 NULL 时补链），并做 `(user, subtitle)` 去重；
   - 快照标记 `rolled_back=True`，映射不会重复应用。
6. **返回 typed `ResegmentResult`**（`before_count/after_count/translations_cleared/snapshot_id` + `favorites_total|remapped|merged|unmatched`、`revisions_total|preserved|unmatched`、`vocabulary_total|relinked|unmatched`）。回滚返回 typed `ResegmentRollbackResult`，额外含 `*_restored_from_snapshot`。

**行为变化**：重断句不再删除用户收藏/编辑历史，而是改指向新分段；译文仍按原设计清空（分段变了无法自动等分翻译），由管理员重触发翻译。

**测试**（`tests/test_subtitle_resegment.py`，新增 8 条）：

- `test_resegment_preserves_favorites_revisions_vocabulary`：1 条三句字幕 + 收藏/编辑历史/词来源句 → resegment 后响应计数 1/1/1，DB 中三类行仍在且 `subtitle_id` 指向**新**字幕 id（不是 NULL、不是旧 id），快照为 v2 且含 `mapping`/`captured`.
- `test_rollback_restores_user_data_onto_original_sentences`：resegment → rollback 后三类行仍指向恢复出的字幕行（`text_en` 还原为原句），`favorites_remapped=1`、`revisions_preserved=1`、`vocabulary_relinked=1`、快照 `rolled_back=True`.
- 纯函数单测：包含判定/边界、最大重叠回退、无重叠 → `None`、重复收藏合并 + unmatched 记账、v1/v2 快照解析兼容。
- `test_restore_lost_user_data_reinserts_and_dedupes`：快照里丢失的行回滚时重插、按 `(user, 字幕)` 去重、词汇只在 NULL 时补链，二次调用幂等。

**已知限制**：`*_unmatched` 的数据在「重断句后、回滚前」的窗口里不在任何字幕上（快照 JSON 保存）；只有回滚能把它恢复（因为当前行没有可承载它的外键）。这是本实现能做到的「不静默丢失」上限。

### 2.2 ADM-01 同源：单行删除字幕默认 409 + `?force=true`

`delete_subtitle` 先统计该行 `sentence_favorites` / `subtitle_revisions` 数量：任一 > 0 且未带 `force` → `ConflictError`（409，`detail={subtitle_id, affected_favorites, affected_revisions}`），**不删任何东西**；`force=True` 才执行，并把级联改成显式语句（删 favorites、删 revisions、`vocabulary.subtitle_id → NULL`），最后返回 `SubtitleDeleteResult{deleted_id, remaining_count, favorites_deleted, revisions_deleted, forced}`。

- 路由：`DELETE /videos/admin/{video_id}/subtitles/{subtitle_id}?force=`（`videos.py`），`response_model=SubtitleDeleteResult`。
- 迁移兼容：无影响数据的旧行为仍可用（无收藏/历史时直接 200，`forced=false`）。

**测试**（`tests/test_admin_subtitle_pipeline.py::TestDeleteSubtitleGuard`）：默认 409 + 计数 + 三类数据原样保留；`force=true` 200 + 计数 + favorites/revisions 显式删除 + vocabulary 置 NULL；无副作用时无需 force。

### 2.3 ADM-02 `retranslate`：状态守卫 + engine 白名单 + 单飞 + 派发失败恢复

`app/services/video_seed_service.py::retranslate_video`：

1. **状态守卫**：仅 `error` / `ready`（含 quality_blocked/quality_warning 两种 flag 的视频，它们的状态就是 error/ready）。`processing` / `ready_subtitles` / `pending_processing` → 409 + 提示等待或用 recover/retry。守卫在**清空译文之前**，不会再有「对正在跑的视频清空译文」。
2. **engine 白名单**：取 `app.services.translation.engines.BUILTIN_ENGINES` 的 key（单一事实源，不复制常量），非法值 → 422 `VALIDATION_ERROR`，不再拖到 Celery 里失败。
3. **单飞锁**：`retranslate:{video_id}`，300s，`SET NX EX`；抢不到 → 409「已有重新翻译任务在进行中」。
4. **派发失败恢复**：清空 `text_zh` + 改状态/quality_flag 后 commit，再 `finalize_video.delay`；`delay` 抛错时用内存快照把每条字幕的 `text_zh` 与视频 5 个字段（status/quality_flag/error_message/processing_step/processing_progress）恢复、commit，并**释放单飞键**，返回 503 `SERVICE_UNAVAILABLE`。不会出现「译文全空且没有任务」。

**测试**（`TestRetranslateGuards`，5 条）：三种 mid-pipeline 状态参数化 409 且译文原样、不派发；非法 engine 422 且不清空；派发失败 503 + 译文/状态/quality_flag/error_message 逐项还原 + 单飞键释放；预置锁 → 409；成功路径落锁且清空/状态推进仍生效。

### 2.4 ADM-03 `recover` / `retry`：不杀活锁 + 60s 单飞

新增 `_processing_lock_live(video)`：

- 锁不存在 → 不冲突；
- 锁存在且 `step_started_at`（回退 `processing_started_at`）距今 ≤ 当前步骤看门狗预算 × 1.2 → **活锁**（预算来自 `pipeline_helpers.STEPS` 同一份声明；`processing_step` 还没写时按 `extracting` 预算，避免 yt-dlp 阶段被误判陈旧）；
- 超过预算或没有可用时间戳 → 陈旧/不可证明 → 允许清理。

`recover_processing` / `retry_video` 在状态检查后先判活锁：活锁 → 409 且**不删锁、不派发**；随后抢 `pipeline:resume:{video_id}`（60s 单飞），抢不到 → 409。派发抛错时回滚 retry 的状态写入并释放单飞键、返回 503（避免管理员被 60s 锁在门外）。`retry` 的「清空 step set」分支改为 helper，语义不变。

**测试**（`TestRecoverRetryLockSafety`，6 条）：活锁（30s 前开始 translating）→ 409 + 锁仍在 + 不派发；陈旧锁（2 天前）→ 200 + 清锁 + 派发 + 单飞键存在；连点第二次 409 且只派发一次；retry 活锁 409；retry 陈旧锁 200；派发失败 503 + 单飞键释放。

### 2.5 ADM-04 `/videos/seed`、`/seed-full`：去重覆盖管线中 + URL 级锁

`seed_video`：

- 去重查询状态集合改为 `pending_processing / processing / ready_subtitles / ready`（`error` 不在集合内，保留重试路径）；用 `.scalars().first()` 兼容历史重复行的 `scalar_one_or_none` 抛错。
- URL 级锁 `seed:{sha1(source_url)}`，120s，`SET NX EX`；抢不到 → 409「该 URL 正在添加中」。整个「查重 + 建行 + 派发」在 `try/finally` 内，`finally` 释放（异常/成功都释放）。
- 建行后 `process_video.delay` 失败：把行标 `error`（`error_message` 记录原因）再返回 503 —— 不再留下「processing 但无任务」的幽灵行。
- `/seed-full` 复用同一服务函数，因此同样受 URL 锁与去重保护；cookies 预检仍在服务外、锁外（两次请求都通过预检也只建一行）。

**测试**（`TestSeedDedupeAndLock`，9 条）：4 种管线中状态参数化去重（201 返回同一 id、不派发、只 1 行）；error 允许新建行（2 行）；预置 URL 锁 → 409 且不建行；连点两次 201 同一行、只派发 1 次；**并发两击** `asyncio.gather` → 结果只能是 (201,201) 或 (201,409)，始终 1 行 1 次派发；派发失败 → 503 + 行状态 error。

### 2.6 ADM-13 `rollback_subtitle` 重新校验时间轴

应用 revision 的 `before` 字段后调用 `_validate_timing`；捕获 `BadRequestError` → `await db.rollback()`（清掉可能被 autoflush 的中间状态）→ `ConflictError`（409，「回滚后的时间轴与相邻字幕冲突，已取消回滚…请先修正相邻字幕时间」）。

**测试**（`tests/test_subtitle_revisions.py::TestRollback::test_rollback_rejects_and_does_not_commit_overlap`）：缩短 A → 邻居 B 前移 → 回滚 A 会重叠 → 409 + A/B 时间原样 + 没有新 revision 落库。

### 2.7 ADM-14 `create_subtitle` 的 `max+1` 串行化

新增 `lock_video_row(db, video_id)`：`SELECT videos.id … FOR UPDATE`；`create_subtitle` 在读取 `max(sentence_index)` 前调用。SQLite（测试库）会忽略该子句，因此另加结构断言（`str(stmt)` 含 `FOR UPDATE`）+ 端到端断言（创建时确实调用了锁函数、追加行的 index 正确）。

**测试**（`TestCreateSubtitleLock`，2 条）：`lock_video_row` 生成的 SQL 含 `FOR UPDATE`（generic dialect）；`POST /videos/admin/{id}/subtitles` 调用 `lock_video_row(video_id)` 且新行 `sentence_index` 正确。

### 2.8 ADM-12 / ADM-10 / ADM-18 schema 层

`app/schemas/video.py`：

- `VideoAdminUpdate.title/title_zh/topic_tags = Field(None, max_length=500)`（与 `videos` 表 `varchar(500)` 对齐）；`ReviewRejectRequest.reason = Field(..., max_length=1000)`。
- `VideoStatusResponse.error_message` 加 `mode="before"` validator：超过 `ERROR_MESSAGE_MAX_LENGTH=500` 截断（DB 列保留全文）；管理/属主状态接口都走该模型。
- 新增 typed 响应模型：`ResegmentResult`、`ResegmentRollbackResult`、`SubtitleDeleteResult`、`VideoScoreFactors`、`VideoScoreResponse`。

`app/api/v1/videos.py`：resegment / rollback / delete subtitle / `/score` 的 `response_model` 从 `dict` 改为上述模型（OpenAPI 不再是 `object`）；`delete` 增加 `force` query 参数；相关 docstring 说明 409/422 语义。

**测试**（`TestSchemaLimits` + `TestVideoScoreTyped`，7 条）：501 字符 title/title_zh/topic_tags → 422 且 DB 未改；1001 字符 reject reason → 422；800 字符 `error_message` → 管理状态接口返回 500 字符、DB 仍 800；`/score` OpenAPI `$ref` + 200 响应字段/负因子值完整保留。

## 3. 对外契约变化（给 Lead / 前端 / 其他并行任务）

| 端点 | 变化 | 兼容性 |
|---|---|---|
| `DELETE /videos/admin/{id}/subtitles/{sid}` | 新增可选 `?force=true`；有收藏/编辑历史时缺省 **409**（envelope `detail` 带计数）；成功响应新增 3 个计数键 | 无副作用时行为不变；有副作用时是**有意的破坏性收紧**，前端（若还有调用）需要在 409 后弹确认再 force |
| `POST /videos/admin/{id}/subtitles/resegment` | 响应 typed（原 5 键全保留 + 计数）；不再删除用户数据 | additive |
| `POST .../resegment/rollback` | 响应 typed（`restored_count`/`snapshot_id` 保留 + 计数） | additive |
| `POST /videos/admin/{id}/retranslate` | 对 processing/ready_subtitles/pending_processing → **409**；非法 engine → **422**；连点 → 409；派发失败 503（原为清空译文后 500/无任务） | 合法调用（error/ready + 合法 engine）行为不变 |
| `POST /videos/admin/{id}/recover`、`/retry` | 活锁 → **409**（原为删锁再派发）；60s 内重复 → 409；派发失败 → 503 | 真正卡死的视频（锁过期）行为不变 |
| `POST /videos/seed`、`/seed-full` | 管线中状态返回既有行（不重复建行/转写）；URL 锁冲突 → **409**；派发失败 → 503 + 行标 error | 首次 seed 行为不变；重复 seed 从「再建一行」变为「返回既有行」 |
| `GET /videos/admin/{id}/status` | `error_message` 截断到 500 字符 | 仅更短 |
| `GET /videos/admin/{id}/subtitles/revisions`（及 per-subtitle） | 新增 `total`；`created_at, id` 稳定排序 | additive |
| `GET /videos/admin/{id}/score` | `response_model` 从 `dict` → `VideoScoreResponse`（字段/值不变） | 结构不变，OpenAPI 变 typed |
| `PATCH /videos/admin/{id}` | 超长 title/title_zh/topic_tags → 422（原 500） | 错误码更准确 |
| `POST /videos/admin/{id}/review/reject` | reason > 1000 → 422 | 同上 |

## 4. 验证证据

环境：中文 Windows，`backend/.venv/Scripts/python.exe`，`PYTHONUTF8=1`、`PYTHONPATH='.'`，命令均在 `backend/` 下。默认套件是内存 SQLite + fake Redis（`tests/conftest.py`），无外部依赖。

### 4.1 Lint / format / 类型

```
> .\.venv\Scripts\python.exe -m ruff check app tests
All checks passed!

> .\.venv\Scripts\python.exe -m ruff format --check app tests
321 files already formatted
```

mypy（CI 的 baseline 门：只拦 `.mypy-baseline` 之外的**新增** `file:code` 对）：

```
> .\.venv\Scripts\python.exe -m mypy app/services/subtitle_edit_service.py \
    app/services/video_seed_service.py app/api/v1/videos.py app/schemas/video.py --ignore-missing-imports
app\services\video_seed_service.py:204: error: Incompatible types in "await" (… [misc])
app\services\video_seed_service.py:205: error: … [misc]
app\services\video_seed_service.py:222: error: … [misc]
```

三条均落在基线既有的 `app/services/video_seed_service.py:misc` 对（redis-py 的 `sismember/srem/sadd` stub 返回 `Awaitable | 返回值` 联合类型，既有代码同源问题），**没有新增 `file:code` 对**，未改 `.mypy-baseline`。

### 4.2 定向测试

本任务 3 个测试文件（新增 44 条，共 53 条）：

```
> pytest tests/test_admin_subtitle_pipeline.py tests/test_subtitle_resegment.py \
    tests/test_subtitle_revisions.py -q
53 passed, 3 warnings in 49.75s
```

（重复运行时 `test_admin_subtitle_pipeline.py` 单文件为 **35 passed**；`test_subtitle_resegment.py` **12 passed**；`test_subtitle_revisions.py` **6 passed**。）

关联回归批次（18 个文件：字幕编辑/搜索/排序/创建/删除、revisions、watchdog、lock TTL、catalog、质量门、pending/processing、pipeline resume、seed-full、videos、takedown 等）：

```
> pytest tests/test_subtitle_edit.py tests/test_subtitle_split_merge.py \
    tests/test_subtitle_reorder_create_delete.py tests/test_word_levels_edit.py \
    tests/test_response_contract.py tests/test_openapi_contract.py \
    tests/test_pipeline_watchdog.py tests/test_pipeline_lock_ttl.py \
    tests/test_catalog_api.py tests/test_translation_quality_block.py \
    tests/test_pending_processing.py tests/test_pipeline_resume.py \
    tests/test_seed_full.py tests/test_videos.py tests/test_video_takedown.py \
    tests/test_subtitle_revisions.py tests/test_subtitle_resegment.py \
    tests/test_admin_subtitle_pipeline.py -q
240 passed, 7 warnings in 265.24s (0:04:25)
```

### 4.3 全量测试

```
> pytest tests/ -q
========== 1460 passed, 14 skipped, 30 warnings in 748.06s (0:12:28) ==========
```

在本机多个并行 agent 同时跑测试的负载下，全量耗时 12–13 分钟（历史基线约 11 分钟）。14 个 skip 全部是需真 Postgres 的 `integration` 用例（本机未设 `PG_TEST_URL`），与本次改动无关；另有一次同版本全量交叉验证为 `1460 passed, 14 skipped`（734.59s）。全量日志：`.tmp-diag/pytest-full-pipeline-fix-final.log`。

本次改动**没有 migration / 模型变更**，也没有 PG 并发写语义改动，因此没有额外补跑 scratch PG 套件；§4.4 单列了唯一需要在 PG 上人工复核的一次写操作。

### 4.4 未执行 / 无法验证

- 真实 Postgres 上的 resegment/rollback 级联行为：未连库执行写操作（默认套件 SQLite 不强制 FK）。代码显式执行 CASCADE/SET NULL 等价语句以消除 DB 方言差异，但**建议 Lead 在 PG scratch 库做一次 resegment+rollback 冒烟**。
- 真实 Redis 上的 `SET NX` 原子性：测试用内存替身（`tests/test_admin_subtitle_pipeline.py::_NxRedis`，与 `test_internal_callback.py` 同模式）；生产语义依赖 redis-py `set(nx=True, ex=...)`，未在真 Redis 上压并发。
- dev 后端 :8000 实时 OpenAPI 未重新抓取（并行队友正在改其他路由，抓取结果会混入他们未完成的状态）；typed 响应由 `create_app().openapi()` 在测试内断言。

## 5. 有意取舍 / Deferred

1. **ADM-01 根治方案（收藏带 video/time/text 快照列 + 失效态）未做**：需要 `sentence_favorites` / `vocabulary` 加列与新迁移，超出 task-6 文件边界，且会改变「收藏」的领域模型。当前实现能保证：重断句不删数据、能映射就映射、不能映射的进快照 JSON、回滚可恢复；Postgres 侧不再发生静默级联删除。
2. **快照 JSON 从 list 升级为 v2 dict**：选在 JSON 列内升级以避免迁移；读取端兼容 v1，旧快照仍可回滚（无用户数据恢复信息）。潜在读者只有 `subtitle_edit_service` 自己（已全文检索确认），模型注释里「list of …」的旧描述与代码不一致，属于模型文件（不在本任务边界）内的注释漂移，未改。
3. **resegment 本身没有单飞/行锁**：两个管理员同时对同一视频点重断句，第二次的快照会基于第一次结果。审计未列该条（ADM-01 只讲数据丢失），本任务未扩；建议后续给 resegment 加 `subtitles:resegment:{video}` 单飞键（可复用本次 helper）。
4. **ADM-04 唯一索引**：`videos(source_url, is_official)` 部分唯一索引需迁移并先清理历史重复行；当前「扩状态去重 + URL 锁」已把连点/并发窗口封住，唯一索引留作后续硬约束。
5. **`/videos/admin` 列表 `total`**：属于 task-7（`video_service.py`），本任务未触碰该文件。
6. **ADM-18 其余项**（手机号导出审计、`raw_json`）未做：任务只要求 status 的 `error_message` 截断；其余属 ADM-09/ADM-18 的基建项（审计表）或未分配。
7. **测试替身兼容**：新增的 Redis 单飞 helper 在函数内 `from app.core.redis import get_redis`，因此 conftest 的 fake 能覆盖所有现有测试；`_FakeRedis` 不支持 `nx=` 时按 **fail-open**（视为抢锁成功）处理，真实 Redis 故障同样 fail-open（`recover/seed` 不能被 Redis 故障永久锁死；`finalize_video` 自己的 `acquire_lock` 才是 fail-closed 的那道门）。

## 6. 风险与遗留（需要 Lead 知情）

1. **行为是收紧的**：单行删除字幕、retranslate/recover/retry/seed 的 409、schema 422、status 截断都会改变错误码。前端管理页（字幕画布、视频详情操作区）若还调用这些接口，需要在 409 后提示/确认；后端已按目录约定返回统一 envelope 与可读 message。
2. **retranslate 只允许 error/ready**：极少数「`status=ready_subtitles` 但翻译确实只有一半」的历史卡住视频，现在必须先 `recover` 或等看门狗标 error 才能 retranslate；这是审计要求的守卫（避免与在跑任务竞写同一批字幕行）。docstring/409 message 里已写引导。
3. **recover 活锁窗口**：如果 worker 在 `acquire_lock` 之后、写 `step_started_at` 之前卡死（ys-dlp 阶段），`processing_started_at` 回退判断会把它当活锁最多 12 分钟（extracting 预算 600s×1.2）后才允许恢复；反过来，如果管理员在真卡死时早点了恢复，会拿到 409 + 说明。权衡是「宁可晚恢复，不可双跑」。
4. **`seed_video` 派发失败的行**：标 error 后若管理员重试，会新建第二行（旧 error 行保留）。当前 seed 没有「复用 error 行」的语义，历史行为也是 error 可重试；重复 error 行需要人工清理（与审计 ADM-04 的既有取舍一致）。
5. **快照 JSON 体积**：重断句快照现在额外包含该视频全部 favorites/revisions/vocabulary 的序列化副本。单视频编辑历史通常很小，但极端情况下（逐句反复编辑）快照会变大；`subtitle_resegment_snapshots` 是 JSON 列，暂无体积上限。若未来发现膨胀，可只存 unmatched + 增量。
6. **并发 resegment 无互斥**（见 §5.3）：低概率，但两个管理员同时点会得到「后一次基于前一次」的快照；数据不会丢（每次都会 capture 当前数据），只是回滚层级会叠加。
7. **测试文件共享**：`tests/test_subtitle_resegment.py` / `test_subtitle_revisions.py` 的既有 9 条断言原样保留；`tests/test_admin_subtitle_pipeline.py` 是新建文件。`tests/test_subtitle_resegment.py` / `test_subtitle_revisions.py` / `test_pending_processing.py` / `test_pipeline_resume.py` / `test_seed_full.py` / `test_video_takedown.py` 在本任务写范围内，其他并行任务若要改这几个文件需与 Lead 协调。

## 7. 复核命令

```powershell
cd backend
$env:PYTHONUTF8=1; $env:PYTHONPATH='.'
.\.venv\Scripts\python.exe -m ruff check app tests
.\.venv\Scripts\python.exe -m ruff format --check app tests
.\.venv\Scripts\python.exe -m pytest tests/test_admin_subtitle_pipeline.py tests/test_subtitle_resegment.py tests/test_subtitle_revisions.py -q
.\.venv\Scripts\python.exe -m pytest tests/ -q
```

## 8. 改动文件清单

| 文件 | 改动 |
|---|---|
| `backend/app/services/subtitle_edit_service.py` | ADM-01 捕获/映射/快照 v2/回滚恢复；同源 delete 409+force；ADM-13 rollback 校验；ADM-14 `lock_video_row`；ADM-10 revisions `total` |
| `backend/app/services/video_seed_service.py` | ADM-02 retranslate 守卫/白名单/单飞/派发恢复；ADM-03 活锁判断 + 60s 单飞 + 派发失败 503；ADM-04 去重扩状态 + URL 锁 + 派发失败标 error |
| `backend/app/api/v1/videos.py` | typed 响应模型接线（resegment/rollback/delete/score）；`force` query；docstring 更新 |
| `backend/app/schemas/video.py` | ADM-12 `max_length`；ADM-18 error_message 截断；`ResegmentResult`/`ResegmentRollbackResult`/`SubtitleDeleteResult`/`VideoScoreResponse` |
| `backend/tests/test_subtitle_resegment.py` | 新增 8 条（保留原 4 条） |
| `backend/tests/test_subtitle_revisions.py` | 新增 1 条（回滚重叠 409） |
| `backend/tests/test_admin_subtitle_pipeline.py`（新建） | 35 条回归：retranslate/recover/retry/seed/delete/schema/revisions total/score |
| `docs/admin-audit-2026-10-26/backend-fixes-pipeline.md`（本文件） | 报告 |

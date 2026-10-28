# 后端清理：移除兑换码系统与退役用户数据表（2026-10-26）

任务：`task-1`「Backend: remove redeem-code system and retired user-data tables」
分支：`redesign`（工作树，未提交）
负责人：backend-remover

## 1. 结论

- 兑换码系统（路由 / 模型 / schema / Celery 任务 / admin 兑换记录接口 / 配置项 / 错误码 / 测试）已全部删除，`/api/v1/redeem-codes/*`、`/api/v1/admin/redemptions*` 不再注册（线上 OpenAPI 实测 0 条）。
- 退役用户数据表 8 张 + 2 个 PG enum 已在同一条新迁移里删除：`redeem_codes`、`shadowing_attempts`、`weekly_reports`、`speaking_attempts`、`speaking_rubrics`、`rubric_criteria`、`speaking_attempt_scores`、`video_practice_questions`、`redeemstatus`、`revokedreason`。
- 对应模型/服务删除，关系、数据导出/注销清理、删视频链路、Celery 装配、迁移 env 引用全部清干净；410 兼容路由壳（跟读 / 热力图 / 周报 / 里程碑 / 旧录音上传）保留且不再引用已删模型。
- `scripts/check_schema_drift.py` 的 `KNOWN_DRIFT` 清空（7 条全部随迁移消失）：dev 库实测 **0 known entries, 0 new**。
- 测试门禁：定向 226 passed；全量 **1364 passed / 14 skipped / 0 failed**（14 个 skip 全为需真 Postgres 的 integration 用例，另行在 scratch 库跑完 **14/14 passed**）；`ruff check` 与 `ruff format --check` 全绿。
- 迁移在 dev 库与 scratch 库都实测通过；scratch 上 `upgrade → downgrade -1 → upgrade` 往返成功，且 downgrade 重建出的 8 张表 DDL 与清理前的 dev 库 **逐行 diff 为空**。

## 2. 迁移

新迁移：`backend/migrations/versions/c3d4e5f6a7b8_drop_redeem_and_retired_tables.py`

```
revision      = "c3d4e5f6a7b8"
down_revision = "q8r9s0t1u2v3"      # 原 head
```

- `upgrade()`：按子表在父表之前的顺序 `drop_table` 8 张表，最后 `DROP TYPE revokedreason` / `DROP TYPE redeemstatus`。
- `downgrade()`：先 `CREATE TYPE` 两个 enum（`create_type=False` 传给列），再按依赖序重建 8 张表、5 个索引、全部 FK / UNIQUE / server_default，结构与清理前 dev 库等价（见 §4.3 的 diff 证据）。
- 数据不可恢复（downgrade 只重建结构）；dev 库整库备份由 Lead 保留在 `.tmp-diag/seeword-pre-cleanup-20261026.dump`（16.3 MB，清理前）。

## 3. 改动清单

### 3.1 删除的文件

| 文件 | 原因 |
|---|---|
| `backend/app/api/v1/redeem.py` | 兑换码全部接口（generate/export/list/summary/redeem/revoke/refund） |
| `backend/app/models/redeem.py` | `RedeemCode` + `RedeemStatus` / `RevokedReason` |
| `backend/app/schemas/redeem.py` | 兑换码请求/响应模型 |
| `backend/app/tasks/redeem_tasks.py` | `expire_unused_redeem_codes` + 同文件里的 `downgrade_expired_pro`（分析见 §6.1） |
| `backend/app/models/shadowing.py` | `ShadowingAttempt` |
| `backend/app/models/weekly_report.py` | `WeeklyReport` |
| `backend/app/services/shadowing_service.py` | 无生产调用点（只有旧测试） |
| `backend/app/services/weekly_report_service.py` | 周报生成（仅旧测试调用） |
| `backend/app/tasks/report_tasks.py` | 周报 Celery 任务壳（空操作）——见 §6.2 |
| `backend/tests/test_redeem.py` | 功能已删除 |
| `backend/tests/test_shadowing_model.py` | 模型已删除；其中「退役事件类型不落库」的活机制覆盖迁移到新文件（见下） |
| `backend/tests/test_weekly_report_d9.py` | 模型/服务/任务已删除；410 路由覆盖仍由 `test_watch_baseline.py` 参数化用例保留 |

### 3.2 新增的文件

| 文件 | 作用 |
|---|---|
| `backend/migrations/versions/c3d4e5f6a7b8_drop_redeem_and_retired_tables.py` | 本次清理迁移 |
| `backend/tests/test_retired_learning_events.py` | 保留原 `test_shadowing_model.py` 里仍在生效的「退役 LearningEvent 类型不得落库」两条断言（不是为凑绿删测试） |

### 3.3 修改的文件（`backend/app`）

- `app/main.py`：移除 `redeem` import 与 `include_router(redeem.router)`。
- `app/models/__init__.py`：移除 `RedeemCode`、`ShadowingAttempt`、`WeeklyReport` 的 re-export；`learning` 只导出 `LearningRecord, Vocabulary`。
- `app/models/learning.py`：删除 `SpeakingAttempt` 整个模型；`learning_records.speaking_attempts` 整数列按任务要求**保留**（API/前端类型仍引用）。
- `app/models/user.py`：删除 `speaking_attempts` relationship；`plan_source` 注释改为「redeem 为历史值，系统已退役」。
- `app/models/subtitle.py`：删除 `speaking_attempts` relationship。
- `app/schemas/__init__.py`：移除兑换码 schema re-export（并顺带由 ruff 修正 import 排序）。
- `app/schemas/admin.py`：删除 `AdminRedemptionRow`、`RedemptionSummaryResponse` 与 `AdminStatsResponse.redeems_today`。
- `app/core/config.py`：删除 `redeem_code_unused_expiry_days`。
- `app/core/errors.py`：删除 `ErrorCode.INVALID_REDEEM_CODE`（全仓含 frontend 已无引用）。
- `app/api/v1/admin.py`：删除 `GET /admin/redemptions`、`GET /admin/redemptions/summary` 及相关 import；docstring 去掉 invite-codes/rubrics。
- `app/services/admin_service.py`：删除 `list_redemptions` / `redemption_summary` / `revoke_redeem_code` / `refund_redeem_code`、`redeems_today` 计算与返回字段、redeem import；顺手修正仍提到「frozen speaking_attempts 表」的过期注释。
- `app/tasks/celery_app.py`：删除 `import app.tasks.redeem_tasks` / `import app.tasks.report_tasks`；删除内测期整段注释掉的 Pro/兑换码 beat 条目（`downgrade-expired-pro`、`expire-unused-redeem-codes`、`send-pro-expiring-reminders`）。
- `app/tasks/account_tasks.py`：数据导出移除 `shadowing`、`speaking_attempts` 两个数据集（JSON/CSV/media/README 文案全部去掉，其他数据集保持）；注销清理移除 `ShadowingAttempt.audio_url` 查询与 `/media/shadowing/{uid}` 目录清理。
- `app/services/video_service.py`：`delete_video()` 中删除 `SpeakingAttempt` 的显式 delete（先后顺序约束随表消失）。
- `migrations/env.py`：移除 `SpeakingAttempt`、`RedeemCode` 的 import。

410 兼容壳**未改**（任务要求保留）：`app/api/v1/shadowing.py`（5 条）、`learning.py` 的 heatmap / weekly-reports、`learning_plan.py` 的 milestones、`video_service` 无关部分、`media.py` 的 `/shadowing-audio` 410 与 `/media/shadowing/...` token 校验分支、`videos.py` 的 `shadowing-sentences` 410。它们本来就只调 `feature_gone()`，不引用已删模型。

### 3.4 修改的文件（`backend/scripts` / `backend/tests`）

- `scripts/check_schema_drift.py`：`KNOWN_DRIFT` 置空（原 4 条 remove_table、2 条 remove_index、1 条 remove_fk 全部随迁移消失），并写明「保持为空，新漂移必须修不能豁免」。
- `tests/test_admin_panel.py`：删除 `TestRedemptions`、`TestRedeemCodesSummaryAndKeyword` 两个类，docstring 同步。
- `tests/test_presence.py`：KPI 字段列表去掉 `redeems_today`；删除 `test_redeems_today_counts_redeemed_codes`。
- `tests/test_response_contract.py`：删除兑换码 admin 路由与 redemption summary 的 OpenAPI 类型断言；只保留 `unlock` 类型断言（测试改名 `test_unlock_response_is_typed`）。
- `tests/test_celery_tasks.py` / `tests/test_celery_tasks_pg.py`：删除引用已删 `redeem_tasks` 的兑换码过期用例与 `downgrade_expired_pro` 用例，docstring 同步；其余订单/对账/评分用例原样保留。
- `tests/test_video_unlock.py`：删除 `TestRedeemDuringTrial`（兑换码叠加试用逻辑随功能删除）。
- `tests/test_milestone_service.py`：删除未使用的 `ShadowingAttempt` import。
- `tests/test_shadowing_api.py`：改为只验证 410 壳（PATCH/DELETE 不写库、upload 不落文件），去掉对已删模型的种子与断言。
- `tests/test_watch_baseline.py`：移除 `ShadowingAttempt/WeeklyReport/report_tasks/weekly_report_service` 引用；退役路由参数化用例去掉「表计数为 0」断言（表已不存在，410 断言保留）；`test_producers_stopped_without_destroying_history` 改为 `test_retired_producers_stay_retired`（校验 beat 里无周报/兑换码任务 + `check_and_award` 兼容返回空）。
- `tests/test_account_deletion.py`：注销/导出用例去掉 `ShadowingAttempt` 种子与 shadowing 媒体；导出 ZIP 断言改为**断言不含** `shadowing.csv` / `media/shadowing/*`（把「退役功能不再进导出包」钉成回归测试）。
- `tests/test_architecture_invariants.py`：`DROPPED_TABLES` 增补本次删除的 8 张表，防止模型/表借尸还魂。

## 4. 验证证据（真实命令与输出）

环境：中文 Windows，`backend/.venv/Scripts/python.exe`，所有命令在 `backend/` 下、带 `PYTHONUTF8=1`、`PYTHONPATH='.'`。

### 4.1 Lint / format

```
> .\.venv\Scripts\python.exe -m ruff check app tests scripts
All checks passed!

> .\.venv\Scripts\python.exe -m ruff format --check app tests
318 files already formatted
```

### 4.2 测试

定向（本次删改涉及的 16 个测试文件）：

```
> pytest tests/test_admin_panel.py tests/test_presence.py tests/test_response_contract.py \
    tests/test_celery_tasks.py tests/test_video_unlock.py tests/test_milestone_service.py \
    tests/test_shadowing_api.py tests/test_retired_learning_events.py tests/test_watch_baseline.py \
    tests/test_account_deletion.py tests/test_openapi_contract.py tests/test_phase1_b0_smoke.py \
    tests/test_architecture_invariants.py tests/test_media_access.py tests/test_notifications.py \
    tests/test_learning.py -q
226 passed, 8 warnings in 210.82s (0:03:30)
```

全量（日志留在 `.tmp-diag/pytest-full-backend-removal.log`）：

```
> pytest tests/ -v
========== 1364 passed, 14 skipped, 26 warnings in 657.98s (0:10:57) ==========
```

14 个 skip 全部是本机未设 `PG_TEST_URL` 的 `integration` 用例（catalog/favorites/jinshuju/watch_progress/celery 的 PG 并发语义），与本次改动无关；单独在 scratch 库补跑：

```
> $env:PG_TEST_URL='postgresql+asyncpg://seeword:seeword_dev@localhost:5432/seeword_cleanup_scratch'
> pytest tests/test_celery_tasks_pg.py -v            → 4 passed
> pytest tests/test_catalog_pg.py tests/test_favorites_pg.py tests/test_jinshuju_pg_concurrency.py tests/test_watch_progress_pg.py -v
                                                      → 10 passed
```

### 4.3 dev 库迁移 + schema drift 门

```
> .\.venv\Scripts\python.exe -m alembic current
q8r9s0t1u2v3
> .\.venv\Scripts\python.exe -m alembic upgrade head
INFO  [alembic.runtime.migration] Running upgrade q8r9s0t1u2v3 -> c3d4e5f6a7b8, Drop the retired redeem-code system and the frozen user-data tables.
> .\.venv\Scripts\python.exe -m alembic current
c3d4e5f6a7b8 (head)

> .\.venv\Scripts\python.exe scripts\check_schema_drift.py
Schema drift gate OK: 0 known entries, 0 new.
> .\.venv\Scripts\python.exe scripts\check_schema_drift.py --list
（空输出）

# dev 库直接查证：8 张表与 2 个 enum 均不存在
> docker exec speaking-db-1 psql -U seeword -d seeword -tAc "<count queries>"
c3d4e5f6a7b8
0
0
```

### 4.4 scratch 库 upgrade → downgrade → upgrade 往返

库：`seeword_cleanup_scratch`（dev 容器内新建，owner `seeword`）。

```
> $env:DATABASE_URL='postgresql+asyncpg://seeword:seeword_dev@localhost:5432/seeword_cleanup_scratch'
> alembic upgrade head
INFO  ... Running upgrade q8r9s0t1u2v3 -> c3d4e5f6a7b8, Drop the retired redeem-code system and the frozen user-data tables.
# 校验：version=c3d4e5f6a7b8，目标表 0，目标 enum 0

> alembic downgrade -1
INFO  ... Running downgrade c3d4e5f6a7b8 -> q8r9s0t1u2v3, ...
# 校验：downgrade 重建出 8 张表 + 2 个 enum

> alembic upgrade head
INFO  ... Running upgrade q8r9s0t1u2v3 -> c3d4e5f6a7b8, ...
# 校验：version=c3d4e5f6a7b8，目标表 0，目标 enum 0
```

结构等价性证据：downgrade 后对 scratch 的 8 张表做 `pg_dump --schema-only -t ...`，与清理前 dev 库同名表 dump 逐行 `Compare-Object`（忽略 `\restrict` token）→ **无差异**（含主键/唯一约束/索引/FK 的 ondelete/server_default）。dump 文件：`.tmp-diag/ddl-dev-original.sql`、`.tmp-diag/ddl-scratch-downgraded.sql`。

### 4.5 线上 dev 服务 / OpenAPI

`http://127.0.0.1:8000`（--reload）在改完后自动重载，健康检查正常：

```
GET /health → {"status":"ok","components":{"database":{"status":"ok"},"redis":{"status":"ok"}}}
```

实时 OpenAPI（206 条路径）：

```
redeem/redemption 路径: （无）
shadowing 兼容壳: /media/shadowing-audio, /api/v1/videos/{video_id}/shadowing-sentences,
                  /api/v1/shadowing/attempts, /api/v1/shadowing/attempts/{attempt_id}, /api/v1/shadowing/stats
AdminStatsResponse 字段: ... signups_today, total_users, ... （无 redeems_today）
```

### 4.6 残留引用 grep（migrations 历史文件除外，任务允许保留）

```
> Select-String -Path app\*.py,app\**\*.py,tests\*.py,scripts\*.py \
    -Pattern 'RedeemCode|redeem_tasks|ShadowingAttempt|WeeklyReport|SpeakingAttempt|redeem-codes|/redemptions|redeem_code'
tests\test_architecture_invariants.py:373: "redeem_codes",                        # DROPPED_TABLES 防复活断言
tests\test_watch_baseline.py:174: assert "expire-unused-redeem-codes" not in ...  # 断言 beat 里没有
```

两条均为「防御性断言」而非生产引用。历史迁移（`r3e4d5e6e7m8`、`e3f4g5h6i7j8`、`d9e0f1g2h3i4`、`g7b8c9d0e1f2` 等）按约定保留原文。

## 5. 有意保留的东西（不在本次范围）

| 残留 | 原因 |
|---|---|
| `learning_records.speaking_attempts` 整数列 + `schemas/learning.py` 同名字段 | Lead 明确「暂保留，API/前端类型仍引用」 |
| `user_learning_profiles.total_shadowing_count` 列 | 跟读计数器，未要求删；无写入方，历史值保留 |
| `MILESTONE_FIRST_SHADOWING`、`EVENT_SHADOWED_SENTENCES` 常量、`VALID_EVENT_TYPES` 不含退役类型 | 退役事件/成就的兼容机制仍在生效（本次已保留其测试） |
| 通知偏好里的 `weekly_report`（`RETIRED_NOTIFICATION_PREFS`） | 通知偏好 API 契约字段，`sanitize_notification_preferences` 恒置 False；`test_notifications` 覆盖 |
| `users.plan_source` 列 | 历史发放来源；只更新了注释（"redeem" 成为历史值） |
| `/media/shadowing/...` token 校验分支（`app/api/v1/media.py`） | 兼容壳，仍可为存量录音文件提供带鉴权的只读访问；`test_media_access.py` 保留 |
| `app/api/v1/shadowing.py`、weekly-reports、heatmap、milestones 等 410 路由 | Lead 要求保留的兼容壳 |
| 前端被删接口 | 由 frontend-remover 负责；当前工作树 `frontend/src` 已无 `redeems_today|redemptions|redeem-codes|/redeem` 引用 |

## 6. 风险与遗留（需要 Lead 知情）

1. **`downgrade_expired_pro` 随 `redeem_tasks.py` 一并删除**。它本身不是兑换码逻辑，而是「Pro 过期写回 free」的任务（ADR-0007 时与兑换码放在同一文件）。其 beat 自内测免费期起就是注释状态，**当前无运行时影响**：金数据收款只延长 `plan_expires_at`，到期用户的访问本来就按有效期判断，`plan` 字段会停在 `pro`（管理后台用 `pro_expired_count` 单独统计）。如果未来要恢复「到期自动降级」，需要把该任务重新实现/安置（可考虑 payment/order tasks）。——按任务「删除 redeem_tasks.py」执行；如不希望删除这一半，请指示，我可以另提一个小迁移-free 的补丁把它迁到 `payment_tasks.py`。
2. **周报空操作 Celery 任务壳 `report_tasks.py` 已删除**（任务要求移除 body/registration 与 import）。生产上如果仍有内测期遗留的 `generate_weekly_reports` 消息在 Redis 里，现在会以 unregistered task 结束；该任务名已无任何调度来源，影响面极低。
3. **存量数据不可恢复**：`upgrade` 直接 DROP 表。dev 有整库备份；**生产执行前必须先备份**（生产迁移按仓库约定只由 backend 容器 `RUN_MIGRATIONS` 执行，本次未触碰生产/部署）。
4. **存量跟读录音文件成为孤儿**：`/media/shadowing/{uid}/` 下的历史音频不再进数据导出 ZIP，也不再随注销清除（按 Lead 指示清理了 account_tasks 里的 shadowing 媒体路径）。媒体路由仍以 token 鉴权提供只读访问；如需隐私/磁盘清理，建议后续做一次性目录清理（不在本任务边界内）。
5. **`redeems_today` 从 `/api/v1/admin/stats` 移除**：属于响应契约变更，前端已同步删除引用（工作树核实）。
6. **`KNOWN_DRIFT` 清空后是硬门**：未跑本次迁移的库（其他开发机/CI e2e job）跑 `check_schema_drift.py` 会因 4 张 remove_table 等差异报「new drift」失败——这是预期行为，必须先 `alembic upgrade head`。
7. scratch 库 `seeword_cleanup_scratch` 保留在 dev Postgres 容器里供复核；清理命令：`docker exec speaking-db-1 psql -U seeword -d postgres -c "DROP DATABASE seeword_cleanup_scratch"`。

## 7. 复核命令速查

```powershell
cd backend
$env:PYTHONUTF8=1; $env:PYTHONPATH='.'
.\.venv\Scripts\python.exe -m ruff check app tests
.\.venv\Scripts\python.exe -m ruff format --check app tests
.\.venv\Scripts\python.exe -m pytest tests/ -v
.\.venv\Scripts\python.exe -m alembic current      # c3d4e5f6a7b8 (head)
.\.venv\Scripts\python.exe scripts\check_schema_drift.py
```

# 迭代 2 收尾复核（2026-10-30）

迭代 2（A05 / A06 / A13）的代码与走查记录已随 `01b47691`、`47dd51d6`、`af7c978a` 合入 `redesign`。
本文件记录 2026-10-30 的复核实测：把此前记为「未执行」、但在本机可以真实跑的两项验收补上，
并对三项出口条件逐条给出可复跑的命令与结果。

环境：Windows 11；`backend/.venv`（Python 3.12.10）；Docker `speaking-db-1`（postgres:16-alpine）、
`speaking-redis-1`（redis:7-alpine）；本地 dev 库迁移版本 `d5e6f7a8b9c0 (head)`。所有 Python 进程带 `PYTHONUTF8=1`。

## 出口条件对照

| 出口条件（`development-plan-2026-10-29.md` §3） | 复核方式 | 结果 |
| --- | --- | --- |
| 管线派发最终收敛且不重复 | 定向单测 93 passed；真实 broker 停机 → 恢复演练（见下） | 通过 |
| 两次并发提交只产生一套答案一次事件 | 一次性 PG 库上 `tests/test_exams_pg.py` 3 用例（含 `asyncio.Barrier` 强制双读未提交） | 通过 |
| 72/73 字节密码行为一致 | `tests/test_password_contract.py`（含在定向 93 passed 内） | 通过 |

## A05：真实 broker 停机演练

此前只做过 monkeypatch 的确定性故障注入；本轮用真实 kombu + 真实 Redis + 真实 PG 跑两相。
数据库是一次性库 `seeword_test_a06`，broker 用一次性容器 `redis:7-alpine`（宿主端口 6391）而非开发用 Redis，
两个相分别在新进程里跑（Celery 实例在 import 时绑定 broker URL）。
脚本：[broker-outage-drill.py](broker-outage-drill.py)。

**A 相：broker 不可达（`redis://127.0.0.1:6399/0`，无人监听）** — 意图照常落库，立即派发失败：

```text
enqueued dispatch <id> for video <video_id>
dispatch_now -> False; status=pending attempts=1
last_error='Error 10061 connecting to 127.0.0.1:6399. No connection could be made because the target machine actively refused it.'
next_attempt_at=<created_at + 10s>
```

**B 相：broker 恢复（一次性 Redis 在 6391，容器已 `ping` 确认）** — beat 扫描补发，恰好一次：

```text
pipeline_dispatch_sent attempts=2 task=app.tasks.video_processing.transcribe_video_gpu video_id=<video_id>
sweep: scanned=1 sent=1 failed=0 abandoned=0
row app.tasks.video_processing.transcribe_video_gpu: status=dispatched attempts=2 last_error=None
```

队列核对：`docker exec seeword-drill-redis redis-cli llen transcription_gpu` → `1`，没有重复投递。
演练后容器与一次性库均已删除。

## A06：真实 Postgres 并发提交

默认套件在内存 SQLite 上跑，`test_exams_pg.py` 在没给 `PG_TEST_URL` 时会跳过（此前本机即为跳过）。
本轮在一次性库 `seeword_test_a06` 上真实执行（该 fixture 在目标库上 `drop_all`/`create_all`，所以必须是独立库）：

```text
PYTHONUTF8=1 PG_TEST_URL="postgresql+asyncpg://seeword:<pw>@localhost:5432/seeword_test_a06" \
    .venv/Scripts/python.exe -m pytest tests/test_exams_pg.py -v
→ 3 passed in 13.42s
```

覆盖：两边先读到 `submitted_at=None` 再用 `asyncio.Barrier` 同时写（只留 3 条答案、1 次 `practiced_items`）、
HTTP 双提交返回同一结果、两份不同答案不能覆盖首个成功结果。

## A13：契约与页面承诺

- 密码/会员语义由定向套件覆盖（`test_password_contract.py`、`test_payments.py`、`test_admin_panel.py`）。
- 购买页四类账号的文案走查见 [README.md](README.md)（2026-10-30，ego-browser）。
- 本轮重跑前端门禁与单测，确认页面改动未漂移。

## 门禁（本轮真实执行）

| 检查 | 结果 |
| --- | --- |
| 后端定向套件：`test_pipeline_dispatch` / `test_internal_callback` / `test_pipeline_watchdog` / `test_password_contract` / `test_payments` / `test_exams_api` | **93 passed**（含新增导入顺序回归用例） |
| 后端全量 `pytest tests/ -q`（`PG_TEST_URL` 指向一次性库，PG 集成用例真实执行） | **1465 passed, 0 skipped**（1272.54s）；此前本机 14–17 个 PG 集成用例因无库跳过 |
| `ruff check app/ tests/` | **通过**（修掉一条失效 `noqa: F401`，见下） |
| `ruff format --check app/ tests/` | **通过**，321 files already formatted |
| `mypy app/ --ignore-missing-imports` + 基线比较 | 38 个 `file:code`，均在 `.mypy-baseline`（39 对）内，**无新增** |
| 前端 `npm run check` | **通过**：design-system 9 条规则、会话写入 2 条规则、`tsc --noEmit`、ESLint、Prettier |
| 前端 `npm run test:unit` | **通过**：31 文件 / 335 测试 |

## 复核中修掉的遗留缺陷

1. **服务模块与 Celery 应用之间的导入循环**：`app.tasks.pipeline_dispatch_tasks` 在模块顶层 import
   `app.services.pipeline_dispatch`，而后者顶层 import `app.tasks.celery_app`（它又在文件底部 import
   任务模块）。结果：任何「先导入服务模块」的入口（脚本、一次性演练）直接 `ImportError: cannot import
   name 'DispatchSweep' from partially initialized module`。应用内的常规入口与 pytest 都先加载了
   `celery_app`，所以测试套件从未暴露它。改为在 `_run_dispatch_pipeline()` 内惰性 import，并新增
   `TestImportOrder` 用子进程直接 import 服务模块作为回归。
2. **`celery_app.py` 里一条失效的 `noqa: F401`**：ruff（0.15.18，与 `requirements-dev.txt` 一致）判定该行
   的 `noqa` 未被使用（RUF100），说明上一提交声明的「ruff 通过」在当时的配置下并不成立——本轮删除。
   未放宽任何检查器或基线。

## 仍未执行（依赖本机之外的条件）

- 积压告警的**站外投递**：`alert_service.send_alert` 本机无订阅端，依赖 A09 的告警链路。
- 真实微信客户端付款链路；生产 `JINSHUJU_ENABLED` 实际状态核对（需要生产访问与真机）。
- broker **数据丢失**（而非不可达）后的补偿属于 A07 的 Redis 恢复契约，本轮不覆盖。

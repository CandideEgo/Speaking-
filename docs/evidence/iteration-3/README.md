# 迭代 3 · A09 实施与演练记录（站外告警 + 备份恢复）

日期：2026-10-30。任务定义见 [`docs/comprehensive-audit-2026-10-29/execution-plan.md`](../../comprehensive-audit-2026-10-29/execution-plan.md) 的 **A09（OPS-05/OPS-06）**。

环境：Windows 11；`backend/.venv`（Python 3.12.10）；Docker 29.9.2（WSL2 Ubuntu-24.04）；演练用一次性 Redis（宿主 6391）、一次性 Postgres（宿主 15433）、本机 webhook 接收器（18080）。未接触开发栈（6379/5432）、未接触生产。

## 1 本任务的实现

### 站外告警（OPS-05）

| 改动 | 说明 |
| --- | --- |
| 生产配置透传 | `docker-compose.prod.yml` 的 backend / celery / celery-beat 三个白名单补上 `SENTRY_DSN`、`ALERT_WEBHOOK_URL`、`ALERT_WEBHOOK_SECRET`；backend 另补 9 个健康阈值变量。此前写进宿主 `.env` 也进不了容器 |
| worker/beat 心跳 | `app/tasks/health_tasks.py`：`worker_ready`/`beat_init` 各起一个 daemon 线程，分别写 `worker:cloud:heartbeat`（TTL 90s，30s 一次）与 `worker:beat:heartbeat`（TTL 180s，60s 一次）。不用任务写心跳，因为长任务会占满并发槽、看起来和死掉一样 |
| 健康监控 | `app/services/health_monitor.py`：在 **web 进程** lifespan 里每 60s 巡检——worker/beat 心跳、云端队列深度、GPU 队列积压且离线、媒体目录磁盘占用、数据库可达性、管线失败率；每类问题在 Redis 里按 `SET NX EX` 节流 30 分钟，Redis 不可用时照常发告警 |
| 独立告警通道 | `alert_service.send_alert` → webhook 不依赖数据库；DB 不可用本身就是其中一类告警 |
| Sentry | `app/core/observability.py` 统一初始化，web/worker/beat 三个进程都上报（此前只有 web）；`before_send` 去掉 `Authorization`/`Cookie`/`X-Callback-Secret` 头 |
| 脱敏 | `app/core/redaction.py`：`?token=`、`Bearer`、`scheme://user:pass@host` 三类模式统一抹掉，告警与 Sentry 共用 |
| 外部探针 | `GET /health/heartbeats`：worker/beat 心跳缺失或过期返回 503，供站外 uptime 使用；GPU 离线只报告不判死（可能是有意离线） |
| 管线失败信号 | `app/services/pipeline_alerting.py`：在失败写入点（`commit_error_state`、看门狗、转录回调 error、转录质量门、翻译质量门）向 Redis 追加带时间的失败记录（上限 200 条、3h TTL），监控据此做窗口计数并带 `video_id` 告警。`videos` 表没有失败时间列，这是不新增迁移的代价与选择 |

### 备份与恢复（OPS-06）

| 文件 | 说明 |
| --- | --- |
| `scripts/backup/backup.sh` | 版本化备份：`pg_dump -Fc` + `pg_restore --list` 校验、alembic revision、14 张关键表精确行数、媒体卷/目录归档与 TOC 校验、部署配置、manifest + `SHA256SUMS`；全部成功才写 `SUCCESS`，失败写 `FAILED` 并非零退出；可选 GPG 加密、站外命令、14 天本地保留（只删带 SUCCESS 的目录） |
| `scripts/backup/restore.sh` | 校验和校验 → `pg_restore --exit-on-error` → 比对 revision 与行数 →（可选）恢复媒体；`--verify-only` 只验归档；目标库非空默认拒绝，`--recreate`/`--force` 显式放行；打印 `elapsed_seconds` 供 RTO 记录 |
| `scripts/backup/README.md` | cron 示例、站外/加密旋钮、恢复步骤、RPO ≤24h / RTO ≤2h 目标与演练口径 |
| `.claude/skills/deploy/SKILL.md` | 第 5 步改为 `pg_dump -Fc` + `pg_restore --list` 校验（旧命令 `pg_dump \| gzip` 没有 pipefail，失败也可能留下合法空 gzip），回滚说明同步改成 `pg_restore --clean` |

## 2 告警演练（真实进程，非单元测试替身）

组件：真实 Celery worker + 真实 beat + 真实 uvicorn（内嵌监控）+ 一次性 Redis/Postgres + 本机 webhook 接收器。
监控参数为缩短窗口：巡检 5s、worker 过期 45s、beat 过期 80s、队列积压阈值 10、节流 600s。
监控默认关闭（开发机可能有意不跑 beat/worker，开着会按节流窗口反复告警并写站内通知），演练以
`HEALTH_MONITOR_ENABLED=true` 打开；生产由 `docker-compose.prod.yml` 透传为 true。

| # | 场景 | 结果 |
| --- | --- | --- |
| 1 | 全部健康 | `GET /health/heartbeats` → 200，`cloud_worker`/`beat` 均 ok；窗口内 0 条告警 |
| 2 | 停 worker | 心跳过期后 503；webhook 收到 `[CRITICAL] 云端 Celery worker 心跳丢失`，`age=48.6s`，带 `probe=6beb5e1d0ea5` |
| 3 | 队列积压 | 停 worker 后入队 15 条任务；收到 `[WARNING] 云端任务队列积压 depth=23 (threshold 10)` |
| 4 | 停 beat | 80s 后收到 `[CRITICAL] Celery beat 心跳丢失 age=83.5s`；端点 503 |
| 5 | DB 停机 | 收到 `[CRITICAL] 数据库不可用（健康检查）`，明确写出“站外通道不依赖数据库，本告警仍会投递” |
| 6 | 脱敏 | 直接调用 `send_alert` 发送含 `?token=SECRETJWT`、`redis://:SUPERSECRET@`、`Bearer ABC.DEF.GHI` 的文本；接收端实际收到 `token=***`、`redis://***@`、`Bearer ***` |

原始告警载荷：[a09-webhook-received.jsonl](a09-webhook-received.jsonl)（5 条，节流生效后同类问题不重复发）。
接收器：[webhook_receiver.py](webhook_receiver.py)。

## 3 备份 / 恢复演练

种子数据：2 用户、2 视频、6 字幕、2 词汇、2 学习记录、1 套试卷 2 题（[seed_a09.py](seed_a09.py)），媒体目录 3 个文件。
演练脚本：[a09_backup_restore_drill.sh](a09_backup_restore_drill.sh)，输出在 [backup-restore/](backup-restore/)。

| 检查 | 结果 |
| --- | --- |
| 备份成功路径 | 生成 `db.dump`（142,774 字节，365 行 TOC）、`manifest.json`、`row_counts.txt`，带 `SUCCESS` 标记 |
| dump 完整性 | `pg_restore --list` 可读；`SHA256SUMS` 校验通过 |
| 故障注入 | 指向不存在的数据库容器 → 备份非零退出、目录里有 `FAILED`、没有 `SUCCESS` |
| `--verify-only` | 校验和与 TOC 通过，未触碰数据库，退出 0 |
| 恢复到全新库 | `pg_restore` 3s；`row counts match the manifest; revision matches`；`RESTORE OK @ d5e6f7a8b9c0` |
| 恢复后数据 | users=2、videos=2、subtitles=6，与源一致；媒体恢复 3 个文件 |
| 恢复耗时 | 本次小数据集 `elapsed_seconds=5`（RTO 目标 ≤2h，以生产数据量演练修正） |

演练中修掉两个脚本缺陷：`BACKUP_CONFIG_FILES=""` 被 `:-` 回退成默认值（改为 `${VAR-}` 语义），
`restore.sh` 的 EXIT trap 里 `[ -n "" ] && rm` 返回 1，把成功的恢复“判成”失败（trap 末条命令改为恒返回 0）。

## 4 门禁

| 检查 | 结果 |
| --- | --- |
| 新增/相关后端测试：`test_health_monitor` / `test_health_heartbeats` / `test_redaction` / `test_alert_service` | 全部通过（含节流、Redis 故障、DB 故障、失败窗口计入/滑出、端点 200/503、脱敏 idempotent） |
| 受影响套件重跑（监控、告警、派发、回调、看门狗） | 69 passed |
| `ruff check app/ tests/`、`ruff format --check` | 通过（330 files already formatted） |
| `mypy app/` 基线门 | 38 个 `file:code`，均在 `.mypy-baseline`（39 对）内，无新增 |
| 全量 `pytest tests/ -q`（`PG_TEST_URL` 指向一次性库） | **1488 passed / 0 skipped**（1283.55s，PG 集成真实执行） |
| `docker compose -f docker-compose.prod.yml config -q` | 通过（补齐的环境白名单不破坏 compose 解析） |

## 5 未执行 / 边界

- **生产站外投递未验证**：本机没有真实钉钉/Slack webhook 与 Sentry DSN，演练用的是本机接收器；生产配置透传后需在 `/deploy` 后用一次真实告警确认。
- **站外定时备份未安装**：cron 需要生产主机上的 rclone/对象存储凭据与密钥，本任务只交付脚本与口径；RPO ≤24h 依赖该 cron 落地。
- **异地恢复未演练**：只在同一台机器的独立容器上恢复；全新主机（含镜像、nginx、媒体卷）的恢复属于生产演练窗口。
- **Sentry 实际收取未验证**：没有 DSN；代码路径由单元/演练覆盖到“初始化 + 脱敏函数”。
- **磁盘近满**：阈值逻辑有单测，没有真的写满磁盘（会破坏开发机）。

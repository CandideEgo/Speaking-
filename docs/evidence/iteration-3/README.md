# 迭代 3 · 实施与演练记录（A09、A07）

日期：2026-10-30。任务定义见 [`docs/comprehensive-audit-2026-10-29/execution-plan.md`](../../comprehensive-audit-2026-10-29/execution-plan.md)：
A09 的 **OPS-05/OPS-06** 与 A07 的 **OPS-03**。

环境：Windows 11；`backend/.venv`（Python 3.12.10）；Docker 29.9.2（WSL2 Ubuntu-24.04）。未接触开发栈（6379/5432）、未接触生产。

## A09：站外告警与备份恢复（OPS-05/06）

### 0 环境

演练用一次性 Redis（宿主 6391）、一次性 Postgres（宿主 15433）、本机 webhook 接收器（18080）。

### 1 本任务的实现

#### 站外告警（OPS-05）

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

#### 备份与恢复（OPS-06）

| 文件 | 说明 |
| --- | --- |
| `scripts/backup/backup.sh` | 版本化备份：`pg_dump -Fc` + `pg_restore --list` 校验、alembic revision、14 张关键表精确行数、媒体卷/目录归档与 TOC 校验、部署配置、manifest + `SHA256SUMS`；全部成功才写 `SUCCESS`，失败写 `FAILED` 并非零退出；可选 GPG 加密、站外命令、14 天本地保留（只删带 SUCCESS 的目录） |
| `scripts/backup/restore.sh` | 校验和校验 → `pg_restore --exit-on-error` → 比对 revision 与行数 →（可选）恢复媒体；`--verify-only` 只验归档；目标库非空默认拒绝，`--recreate`/`--force` 显式放行；打印 `elapsed_seconds` 供 RTO 记录 |
| `scripts/backup/README.md` | cron 示例、站外/加密旋钮、恢复步骤、RPO ≤24h / RTO ≤2h 目标与演练口径 |
| `.claude/skills/deploy/SKILL.md` | 第 5 步改为 `pg_dump -Fc` + `pg_restore --list` 校验（旧命令 `pg_dump \| gzip` 没有 pipefail，失败也可能留下合法空 gzip），回滚说明同步改成 `pg_restore --clean` |

### 2 告警演练（真实进程，非单元测试替身）

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

### 3 备份 / 恢复演练

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

### 4 门禁

| 检查 | 结果 |
| --- | --- |
| 新增/相关后端测试：`test_health_monitor` / `test_health_heartbeats` / `test_redaction` / `test_alert_service` | 全部通过（含节流、Redis 故障、DB 故障、失败窗口计入/滑出、端点 200/503、脱敏 idempotent） |
| 受影响套件重跑（监控、告警、派发、回调、看门狗） | 69 passed |
| `ruff check app/ tests/`、`ruff format --check` | 通过（330 files already formatted） |
| `mypy app/` 基线门 | 38 个 `file:code`，均在 `.mypy-baseline`（39 对）内，无新增 |
| 全量 `pytest tests/ -q`（`PG_TEST_URL` 指向一次性库） | **1488 passed / 0 skipped**（1283.55s，PG 集成真实执行） |
| `docker compose -f docker-compose.prod.yml config -q` | 通过（补齐的环境白名单不破坏 compose 解析） |

### 5 未执行 / 边界

- **生产站外投递未验证**：本机没有真实钉钉/Slack webhook 与 Sentry DSN，演练用的是本机接收器；生产配置透传后需在 `/deploy` 后用一次真实告警确认。
- **站外定时备份未安装**：cron 需要生产主机上的 rclone/对象存储凭据与密钥，本任务只交付脚本与口径；RPO ≤24h 依赖该 cron 落地。
- **异地恢复未演练**：只在同一台机器的独立容器上恢复；全新主机（含镜像、nginx、媒体卷）的恢复属于生产演练窗口。
- **Sentry 实际收取未验证**：没有 DSN；代码路径由单元/演练覆盖到“初始化 + 脱敏函数”。
- **磁盘近满**：阈值逻辑有单测，没有真的写满磁盘（会破坏开发机）。

## A07：Redis 恢复契约（OPS-03）

隔离环境按 [D6 方案](../../iteration-3-isolation-validation-2026-10-30.md) 第 2 节搭建：compose 项目
`seeword-isolation`、Redis `127.0.0.1:16379`、命名卷 `seeword-isolation_redisdata`、一次性 PG
`127.0.0.1:15432/seeword_isolation`。未接触开发栈（6379/5432）与生产。

### 1 交付物

| 文件 | 作用 | 生产是否复用 |
| --- | --- | --- |
| [`deploy/redis/redis.conf`](../../../deploy/redis/redis.conf) | AOF（`appendfsync everysec`）、关闭 RDB、`noeviction`、`aof-load-truncated` | **是**，放量时原样进生产 |
| [`docker-compose.isolation.yml`](../../../docker-compose.isolation.yml) | 隔离栈：Redis + `pg` profile；只差项目名、端口与一次性密码 | 否 |
| [`scripts/isolation/test_a07_redis_recovery.py`](../../../scripts/isolation/test_a07_redis_recovery.py) | T1–T8 用例矩阵，逐条记录命令与原始输出；`--cases` 可单跑，`--keep` 留现场 | 否 |
| [a07-2026-10-30.json](a07-2026-10-30.json) | 本次运行结果（8/8 PASS）与每条用例的命令、原始输出 | — |
| [`scripts/isolation/README.md`](../../../scripts/isolation/README.md) | 运行与清理方式 | — |

### 2 用例结果

| # | 用例 | 实测 |
| --- | --- | --- |
| A07-T1 | 容器重启 | 100 个带 TTL 的键全在，TTL 未重置（重启后继续倒数） |
| A07-T2 | 容器替换（`down` 不删卷） | 100 键全在；启动日志 `DB loaded from append only file` |
| A07-T3 | SIGKILL 异常停机 | 3 轮、每轮约 245 键，**进程级丢失 0.000s**；`redis-check-aof` 全绿 |
| A07-T4 | AOF 配置生效 | `appendonly=yes`、`appendfsync=everysec`、`save=''`、`maxmemory-policy=noeviction`、`aof_last_write_status=ok` |
| A07-T5 | 卷丢失（最坏情况） | 空卷重启前 dbsize=842 → 重启后 0；13 类状态逐项确认全部丢失，后果表见 JSON `loss_table` |
| A07-T6 | 按 DB 状态补偿 | broker 全丢后 beat 扫描：第一次 `sent=1`，`transcription_gpu` llen=1；第二次 `sent=0`、llen 仍 1（不重复） |
| A07-T7 | 撤销状态丢失 | 清空前黑名单命中（请求被拒）；清空后同一 token 重新可用（既有 fail-open）；封禁与改密仍拒绝 |
| A07-T8 | 旧卷迁移 | 旧 RDB 卷 → 新命名卷 → AOF：键、TTL（599s→590s）、list 全部保留，启动日志从 AOF 加载 |

### 3 两条必须写进口径的结论

**（1）`docker kill` 测的是进程级持久化，不是 everysec 窗口。**
Redis 在每轮事件循环里已经把 AOF buffer `write(2)` 进文件，`appendfsync everysec` 只决定
`fsync` 的时机；SIGKILL 杀进程不会清空内核页缓存，所以实测丢失为 0。宿主内核崩溃/掉电才会
暴露 everysec 的未 fsync 窗口——本演练不重启宿主（会同时打断开发栈与 Docker），因此该窗口
**未实测**，按配置语义给出 ≤1s 上界加调度抖动，契约取 2s。不要把这个 0 当成掉电也零丢失。

**（2）AOF 开启时 Redis 7 不会回退加载 RDB。**
第一轮演练把旧 RDB 卷直接拷进新卷、用 AOF 配置启动，得到的是空库，日志只有
`Creating AOF base file ... on server start`。正确的迁移路径（T8 已按此验证）：
`appendonly no` 启动加载 RDB → `CONFIG SET appendonly yes` 触发重写生成 AOF → 再切到
`deploy/redis/redis.conf` 启动。生产放量清单（D6 §5.1）已按此修正。

### 4 门禁

| 检查 | 结果 |
| --- | --- |
| 演练脚本 `ruff check` / `ruff format --check`（与 backend 同口径） | 通过 |
| `docker compose -p seeword-isolation -f docker-compose.isolation.yml config -q` | 通过 |
| 演练本身 | **8/8 PASS**，`docs/evidence/iteration-3/a07-2026-10-30.json` |
| 后端应用代码 | 本任务未改动；未重跑全量 pytest（上一轮 A09 结束时 1488 passed / 0 skipped） |

### 5 未执行 / 边界

- **生产 Redis 配置与命名卷未改**：按 D6，A07 放量是独立发布，需要负责人确认窗口，并按
  D6 §5.1 做「备份 → 卷迁移 → 核验 → 回滚点保留」。
- 宿主崩溃/掉电的 everysec 窗口未实测（见上）；生产数据量下的 AOF 重写耗时未测。
- 空卷冷启动（现场不可拷贝旧卷）的提前通知与接受面未在生产演练。

## A10：GPU 服务端权限边界（OPS-04）

隔离环境同 A07（compose 项目 `seeword-isolation`、Redis `127.0.0.1:16379`、一次性 PG）。
本次 Redis 改为从渲染出的 ACL 文件启动（`default` / `cloud` / `gpu` 三个身份），其余不变。

### 1 交付物

| 文件 | 作用 | 生产是否复用 |
| --- | --- | --- |
| [`deploy/redis/users.acl.template`](../../../deploy/redis/users.acl.template) | ACL 身份与白名单；模板不含密码 | **是**，放量时渲染后挂载 |
| [`scripts/isolation/render_redis_acl.py`](../../../scripts/isolation/render_redis_acl.py) | 由模板 + 环境变量渲染；剥掉注释（Redis ACL 文件不接受注释，实测） | 是 |
| [`gpu-worker/gpu_worker/broker_settings.py`](../../../gpu-worker/gpu_worker/broker_settings.py) | GPU 私有未确认命名空间（`gpu_unacked` / `gpu_unacked_index` / `gpu_unacked_mutex`） | **是** |
| [`gpu-worker/gpu_worker/broker_recovery.py`](../../../gpu-worker/gpu_worker/broker_recovery.py) | worker 启动时把孤儿未确认消息按原 exchange/routing key 重新入队 | **是** |
| [`gpu-worker/gpu_worker/celery_app.py`](../../../gpu-worker/gpu_worker/celery_app.py) | 接上上述 transport options；`task_ignore_result=True`；`worker_enable_remote_control=False` | **是** |
| [`gpu-worker/scripts/start_gpu_worker.py`](../../../gpu-worker/scripts/start_gpu_worker.py) | 启动时调用孤儿恢复 | **是** |
| [`gpu-worker/tests/test_broker_settings.py`](../../../gpu-worker/tests/test_broker_settings.py) | 不加载 torch 的配置断言（与生产共用同一份定义） | 是 |
| [`scripts/isolation/gpu_stub_worker.py`](../../../scripts/isolation/gpu_stub_worker.py) | 以 gpu 身份消费的桩 worker（无 torch/whisperx） | 否 |
| [`scripts/isolation/test_a10_gpu_acl.py`](../../../scripts/isolation/test_a10_gpu_acl.py) | T1–T10 用例矩阵 | 否 |
| [a10-2026-10-30.json](a10-2026-10-30.json) | 本次运行结果（9 PASS / 0 FAIL / 1 SKIP） | — |

### 2 用例结果

| # | 用例 | 实测 |
| --- | --- | --- |
| A10-T1 | 云身份不受影响 | cloud 身份写黑名单/限流/队列/缓存全成功；`ACL WHOAMI=cloud` |
| A10-T2 | GPU 正常消费 | 桩 worker 消费 1 条并回调；心跳 TTL=87s；无 `celery-task-meta-*`；`celery.pidbox` 订阅 0；**正常路径 ACL LOG 0 条拒绝** |
| A10-T3 | 未确认消息隔离 | 消费中被杀：`gpu_unacked=1`、云 `unacked=0`、队列 0；重启后恢复回调，最终 `gpu_unacked=0` |
| A10-T4 | 撤销状态被拒 | `GET/SET/EXISTS token_blacklist:*` 全部 NOPERM |
| A10-T5 | 写云队列被拒 | `LPUSH celery`、`SADD _kombu.binding.celery` 全部 NOPERM |
| A10-T6 | 危险命令被拒 | `FLUSHALL/FLUSHDB/CONFIG GET/CONFIG SET/DEBUG/MONITOR/CLIENT KILL/ACL SETUSER/ACL LIST/KEYS/SCAN/SHUTDOWN` 共 12 条全部被拒 |
| A10-T7 | 其它键被拒 | `ai_cache:*`、`cache:*`、`worker:gpu:other` 全部 NOPERM |
| A10-T8 | 结果与遥控关闭 | `SUBSCRIBE/PSUBSCRIBE/PUBLISH/PUBSUB` 全部被拒；结果键 0；pidbox 订阅 0 |
| A10-T9 | SSH 隧道限制 | **SKIP**：需要生产宿主 sshd；清单见 JSON `evidence`（`authorized_keys` 的 `restrict,port-forwarding,permitopen="127.0.0.1:6379"`、`PermitOpen`、验证命令） |
| A10-T10 | 回调密钥 | 缺失/错误 → 401；正确 → 200 `acknowledged`；非 ASCII 头 → 401（不是 500）；轮换后旧 401、新 200 |

### 3 ACL 收敛过程（靠 ACL LOG，不靠猜）

最小集合起步后被实测补进的命令/键：

| 触发 | 补进白名单 | 说明 |
| --- | --- | --- |
| 队列声明 `_size` | `+llen`、`~transcription_gpu*` | kombu 会 `LLEN` 队列本体 **以及优先级后缀 3/6/9**；精确名 `~transcription_gpu` 会漏掉后三个 |
| 队列绑定 | `+sadd`、`~_kombu.binding.transcription_gpu*` | 消费者声明队列时写入绑定集合 |
| 未确认恢复互斥 | `+eval +evalsha` | redis-py 的 `Lock` 释放走 Lua；被拒时恢复会静默失败。Redis 7 在脚本内仍按同一 key 模式校验，但允许 EVAL 是**已知取舍**，已写在模板里 |
| 孤儿恢复 | `+zrange` | 启动时列出私有未确认索引 |

收敛完成后，正常消费与“杀掉再恢复”两条路径的 `ACL LOG` 均为 0 条拒绝。

### 4 两个结构性问题（本轮实测发现并修正）

**（1）Celery 的 async hub 循环不会执行 kombu 的可见性恢复。**
kombu 的 `maybe_restore_messages` 只在同步 `Transport.get()` 里调用；Celery worker 默认走
async hub，直接读 socket，`restore_visible` 根本不会周期性运行。裸 kombu 的
`drain_events` 能恢复同一条消息，Celery worker 不能——硬杀后消息会永远留在 `gpu_unacked`。
修正：`gpu_worker/broker_recovery.py` 在 worker 启动时把私有命名空间里的所有条目重新入队
（启动进程没有任何自己的在途消息，所以它们必然属于上一个已死进程），`start_gpu_worker.py`
与桩 worker 都调用。T3 用生产默认 `visibility_timeout=3600s` 验证，恢复来自启动路径而不是
压缩后的可见性窗口。
**部署假设：一个 GPU worker**（`--pool=solo`、并发 1）。若横向扩到两个 worker，后启动者会把
另一个活着的 worker 的在途消息也恢复；扩容前必须改这个例程。

**（2）`unacked_mutex_key` 也是共享键。**
只改 `unacked` / `unacked_index` 时，GPU 仍会碰云端的 `unacked_mutex`。已一并改为
`gpu_unacked_mutex`，ACL 只放行这三个键与心跳键。

### 5 门禁

| 检查 | 结果 |
| --- | --- |
| GPU worker 纯配置/契约/安全守卫测试（`test_broker_settings` / `test_contracts` / `test_security_guard`） | **16 passed**（用 backend venv 跑，不加载 torch） |
| `ruff check` / `ruff format --check`（`scripts/isolation/`、`gpu-worker/`） | 通过 |
| 隔离演练 | **9 PASS / 0 FAIL / 1 SKIP**，见 [a10-2026-10-30.json](a10-2026-10-30.json) |
| 后端应用代码 | 未改动；未重跑全量 pytest（上一轮 1488 passed / 0 skipped） |

### 6 未执行 / 边界

- **生产 Redis ACL、GPU 机 `.env.gpu-worker` 未切换**：按 D6 §5.2 放量（先加身份、再切 GPU、
  最后收紧 default），需要窗口与回滚点。
- **T9 未执行**：需要生产宿主 sshd 的 `authorized_keys`/`PermitOpen`；隔离栈没有 sshd，D6 又
  禁止引入新镜像。配置与验证命令已写进 JSON 的 `SSH_CHECKLIST`。
- **真实 GPU worker（torch/whisperx）未跑**：本机没有 `gpu-worker/.venv`；桩 worker 只验证
  broker/ACL 面，不验证转录本身。
- 两个 GPU worker 的横向扩容与启动恢复不兼容（见上）。

# 迭代 3 · A07 / A10 的隔离环境验证方案（D6 决议）

日期：2026-10-30。对应审计任务：`docs/comprehensive-audit-2026-10-29/execution-plan.md` 的 **A07（OPS-03，Redis 恢复契约）**
与 **A10（OPS-04，GPU 服务端权限边界）**；对应开发计划里的决策 **D6**（是否接受这类基础设施改造先做隔离环境验证再放量）。

本文件是**验证方式**的唯一家：环境怎么搭、每个用例怎么判、什么条件下才能碰生产。
A09（站外告警与备份恢复）先于 A07/A10 实施，仍是迭代 3 的第一步；本方案不改变 `development-plan-2026-10-29.md` 的迭代顺序。

## 1 D6 结论

**A07 / A10 一律先在隔离环境完成验收，再讨论生产放量；隔离验收不通过就不改生产配置。**

- 两者都改共享基础设施（Redis 启动参数、凭据、卷）。在开发栈或生产上直接试，失败面是「全站会话撤销失效 / 队列丢失 / GPU 断连」，
  且没有可回滚的快照可比对。
- 隔离环境用与生产相同的镜像与启动参数，只换项目名、端口与卷；验收产物是可复跑的命令与输出，而不是「配置看起来对」。
- 生产放量是独立的一次发布：先备份、先演练回滚、再由负责人确认窗口（`/deploy` 流程）。本次任务只到「隔离验收通过 + 放量步骤写清」。

## 2 隔离环境定义

### 2.1 边界（不与开发栈、生产共用任何资源）

| 项 | 取值 | 说明 |
| --- | --- | --- |
| compose 项目名 | `seeword-isolation` | `docker compose -p seeword-isolation ...`，所有容器/网络/卷带该前缀 |
| compose 文件 | `docker-compose.isolation.yml`（新增，勿与三个现有 compose 混用） | 只放 Redis/可选 PG/可选 sshd，不放 backend/frontend |
| Redis 端口 | `127.0.0.1:16379` | 开发栈与生产的 6379 不动；只听环回 |
| Redis 卷 | `seeword-isolation-redisdata` | 命名卷，验证 A07 的「命名卷」本身 |
| 可选 PG | `127.0.0.1:15432`，库 `seeword_isolation` | 只给 A07 的「按 DB 状态补偿」用例；用完删除 |
| 可选 sshd | 容器 `seeword-isolation-sshd`，端口 `127.0.0.1:12222` | 只给 A10 的隧道限制用例 |
| 镜像 | `redis:7-alpine`、`postgres:16-alpine`（与生产同 tag） | 不引入新镜像 |
| 清理 | `docker compose -p seeword-isolation --profile pg down -v` | 一条命令回收全部（`pg` 在 profile 里，普通 `down` 不会带走它）；禁止 `docker system prune` |

安全约束：不在隔离环境里使用生产凭据；不填真实 `TRANSCRIPTION_CALLBACK_SECRET`（用一次性值）；
GPU 侧用 `gpu-worker` 的**桩任务**（`gpu_stub_worker.py`，只 sleep 后调回调），不加载 torch/whisperx 与模型。

### 2.2 文件落点

| 文件 | 作用 | 生产复用的部分 |
| --- | --- | --- |
| `docker-compose.isolation.yml` | 隔离栈定义（Redis + profile 可选 PG/sshd） | 否（只用于验收） |
| `deploy/redis/redis.conf` | AOF/卷/目录等启动参数 | **是**，A07 放量时原样进生产 |
| `deploy/redis/users.acl.template` | ACL 身份与 key/命令允许集（占位密码） | **是**，A10 放量时渲染后进生产 |
| `scripts/isolation/render_redis_acl.py` | 由模板 + 环境变量生成 acl 文件（密码不落 git） | 是（放量脚本复用） |
| `scripts/isolation/test_a07_redis_recovery.py` | A07 用例矩阵与断言 | 否 |
| `scripts/isolation/test_a10_gpu_acl.py` | A10 用例矩阵与断言 | 否 |
| `scripts/isolation/gpu_stub_worker.py` | 以 GPU 身份消费 `transcription_gpu` 的桩 worker | 否 |
| `docs/evidence/iteration-3/` | 每次运行的输出、ACL LOG、`INFO persistence` 摘要 | — |

## 3 A07：Redis 恢复契约

### 3.1 方案选择

**采用：单实例 Redis + 命名卷 + AOF（`appendonly yes`、`appendfsync everysec`）**，明确允许损失窗口，不做「缓存 / broker 拆分」。

- 拆成两个实例会把 broker、token 黑名单、回调去重、限流四类状态分散到不同部署单元，回滚面更大；当前容量与故障面不需要。
- 允许损失窗口写死为 **≤ 2 秒的写入**（`everysec` 的 fsync 间隔 + 实测抖动），并逐类列出丢失后的后果（见 3.3）。
- 队列任务本身仍要求幂等：持久化不等于 exactly-once，A05 的 outbox + 看门狗是丢失后的补偿通道。

### 3.2 用例矩阵（全部在隔离环境执行）

| # | 情景 | 做法 | 通过标准 |
| --- | --- | --- | --- |
| A07-T1 | 容器重启 | 写 100 个带 TTL 的键 → `docker restart` | 100 个键全在，TTL 未重置 |
| A07-T2 | 容器替换（同卷） | `down`（不带 `-v`）→ `up` → 读键 | 键全在，`INFO persistence` 显示 AOF 已加载 |
| A07-T3 | 异常停机损失窗口 | 以 10ms 间隔写入带时间戳的键 5 秒，期间 `docker kill`（SIGKILL），重启后统计缺失 | 丢失时间跨度 ≤ 2s；`redis-check-aof` 通过；记录实测值 |
| A07-T4 | AOF 配置生效 | `CONFIG GET appendonly/appendfsync`、`INFO persistence` | `aof_enabled:1`、`aof_last_write_status:ok` |
| A07-T5 | 卷丢失（最坏情况） | 用全新空卷启动，逐类核对丢失面 | 队列消息、未确认消息、黑名单 TTL 键、去重键、限流计数全部丢失；输出「丢失后果表」与本次实测 |
| A07-T6 | 按 DB 状态补偿 | 在 PG 里留一条 pending 派发意图 → 杀 Redis → 空卷重启 → 跑 beat 扫描 | 队列恰好 1 条补发消息，视频状态推进；不产生重复副作用 |
| A07-T7 | 撤销状态的可接受性 | 造一个已登出 token，杀 Redis 重启后请求 | 黑名单键丢失 → token 可再用（**fail-open 既有契约**），确认其他护栏（封禁/改密）仍在；窗口写进放量说明 |
| A07-T8 | 卷内容迁移 | 模拟旧匿名卷数据，停 Redis 后复制到命名卷并启动 | 键与 TTL 一致；验证生产切换时「拷贝旧卷」这条路可行 |

### 3.3 必须写进结论的「丢失后果表」

| 状态 | 丢失后果 | 补偿 |
| --- | --- | --- |
| 队列 / 未确认消息 | 任务不执行 | 管线走 `pipeline_dispatches` outbox + 看门狗；订单走对账任务；其余记录为已知缺口 |
| `token_blacklist:*` | 已登出/撤销但未过期的 token 在窗口内重新可用 | 既有 fail-open 契约；封禁与改密仍由 DB 判定；**不新增**兜底表 |
| 回调去重锁、派发告警节流 | 可能重复处理/重复告警 | 处理端幂等（状态守卫、A05 去重） |
| 限流与会话计数 | 短时间内限流变宽 | 可接受，记录 |

### 3.4 实施结果（2026-10-30）

A07 的隔离验收已按本矩阵执行，**8/8 通过**：`deploy/redis/redis.conf` 与
`docker-compose.isolation.yml` 落地，逐条命令、原始输出与丢失后果表见
[`docs/evidence/iteration-3/README.md`](evidence/iteration-3/README.md) 与
[`a07-2026-10-30.json`](evidence/iteration-3/a07-2026-10-30.json)。两条口径修正：
SIGKILL 测的是进程级持久化（实测 0 丢失），everysec 的宿主掉电窗口未实测；卷迁移不能
直接拷 RDB 后开 AOF 启动（§5.1 已改）。生产放量仍未执行。

## 4 A10：GPU 服务端权限边界

### 4.1 方案选择

**采用：Redis 7 ACL 给 GPU 单独身份 + GPU 侧三处配置收紧**，而不是另起一个 broker 实例。

- ACL 的 key 模式与命令允许集能挡住审计列出的攻击面（读黑名单、写云队列、`FLUSHALL`、任意键）。
- 但 kombu 的 `unacked` / `unacked_index` 是**跨队列共享键**，只靠 key 模式仍可被 GPU 触碰云任务的未确认消息。
  kombu 支持 `unacked_key` / `unacked_index_key` 作为 transport 选项，因此在 GPU 应用里改名为 `gpu_unacked` / `gpu_unacked_index`，
  ACL 就只需放行这三个 GPU 专用键。
- GPU 侧同时关闭两条不需要的通道：`task_ignore_result=True`（结果只走 HTTP 回调，不写 `celery-task-meta-*`）、
  `worker_enable_remote_control=False`（不订阅 `celery.pidbox`，避免取得对云 worker 的控制通道）。三项改动在隔离环境验证后再进 GPU 机。

### 4.2 ACL 身份（最终形态以模板为准）

唯一事实源是 [`deploy/redis/users.acl.template`](deploy/redis/users.acl.template)（密码用占位符，
渲染见 `scripts/isolation/render_redis_acl.py`）。三个身份：`default`（回滚路径）、`cloud`（全权）、
`gpu`（只碰自己的队列、未确认命名空间与心跳键）。

与初稿的差异，全部来自 A10 实测（ACL LOG + 桩 worker）：

- 队列键模式必须是 `~transcription_gpu*`：kombu 的优先级队列还有 `3/6/9` 后缀，精确名会漏掉。
- `unacked_mutex_key` 是**第三把**共享键，只私有化 `unacked` / `unacked_index` 不够；已改为
  `gpu_unacked_mutex`。
- 正常路径需要 `LLEN`（队列声明时的 `_size`）、`SADD`（绑定集合）与 `EVAL/EVALSHA`
  （kombu 恢复未确认消息时用 redis-py `Lock` 做互斥，释放走 Lua）。EVAL 是**已知取舍**：
  Redis 7 仍按同一 key 模式校验脚本访问的键，但 GPU 身份确实获得了执行 Lua 的能力，已写进模板。
- 命令集是 `-@all` 白名单（不是 `+@all` 减拒绝清单）；最终集合由 ACL LOG 收敛，正常消费与
  杀掉恢复两条路径均为 0 条拒绝。

### 4.3 用例矩阵（全部在隔离环境执行）

| # | 情景 | 做法 | 通过标准 |
| --- | --- | --- | --- |
| A10-T1 | 云身份不受影响 | 用 cloud 身份跑 `test_a07_*` 的写入/限流/黑名单路径 | 全部成功，无 NOPERM |
| A10-T2 | GPU 正常消费 | 桩 worker 以 gpu 身份启动并消费 1 条任务，写心跳，回调桩服务 | 任务完成、`ACL LOG` 无 NOPERM、心跳键存在且 TTL≈90s |
| A10-T3 | 未确认消息隔离 | GPU 消费后进程被杀，重启后恢复 | 任务重回 `transcription_gpu`；云侧 `unacked` 未被触碰 |
| A10-T4 | 读撤销状态被拒 | `GET/SET/EXISTS token_blacklist:*` | NOPERM |
| A10-T5 | 写云队列被拒 | `LPUSH celery`、`SADD _kombu.binding.celery` | NOPERM |
| A10-T6 | 清库/危险命令被拒 | `FLUSHALL`、`FLUSHDB`、`CONFIG GET/SET`、`SHUTDOWN`、`DEBUG`、`MONITOR`、`CLIENT KILL`、`ACL SETUSER`、`KEYS *`、`SCAN` | 全部 NOPERM/unknown command |
| A10-T7 | 其它键被拒 | `SET ai_cache:*`、`SET cache:*`、`SET worker:gpu:*`（除心跳键） | NOPERM |
| A10-T8 | 结果与遥控通道关闭 | 检查 Redis 中无 `celery-task-meta-*`；`PSUBSCRIBE *`/`SUBSCRIBE celery.pidbox` 被拒 | 无结果键；pubsub 被拒 |
| A10-T9 | 隧道与账户限制 | 隔离 sshd：受限 key 仅允许转发到 16379，尝试 shell、pty、其它端口、反向/动态转发 | 仅目标转发成功，其余被服务端拒绝 |
| A10-T10 | 回调密钥边界 | 错误 secret → 401；轮换演练（两侧同时换，旧 secret 立即失效） | 均符合；轮换步骤写进放量清单 |

### 4.4 实施结果（2026-10-30）

隔离验收 **9 PASS / 0 FAIL / 1 SKIP**，逐条命令与原始输出见
[`docs/evidence/iteration-3/a10-2026-10-30.json`](evidence/iteration-3/a10-2026-10-30.json)，
说明见 [`docs/evidence/iteration-3/README.md`](evidence/iteration-3/README.md)。三处实现：
`deploy/redis/users.acl.template` + 渲染脚本；GPU 侧 `broker_settings.py`（三把私有键）、
`celery_app.py`（忽略结果、关闭遥控）、`broker_recovery.py`（启动恢复孤儿未确认消息）；
`docker-compose.isolation.yml` 的 Redis 改为 `--aclfile` 启动。

**结构性问题（本轮发现并修正）**：Celery 默认的 async hub 循环从不调用 kombu 的
`maybe_restore_messages`，因此 `visibility_timeout` 的恢复在真实 worker 上不会周期性运行——
硬杀后消息会永远留在 `gpu_unacked`。修正为 worker 启动时主动恢复私有命名空间里的孤儿消息。
部署假设是**一个 GPU worker**；横向扩容会让后启动者恢复另一个活 worker 的在途消息。

**T9 未执行**：它验证生产宿主 sshd 的 `authorized_keys` / `PermitOpen`，隔离栈没有 sshd，
D6 又禁止引入新镜像；配置与验证命令已写进证据 JSON 的 `SSH_CHECKLIST`，放量窗口在宿主上执行。

## 5 放量与回滚（隔离通过之后才执行）

### 5.1 A07（Redis 持久化）

1. 生产先取备份：`ACL SAVE`（若已启用）、卷/`docker cp` 快照、compose 与 `.env` 备份（沿用 `/deploy` 的备份步骤）。
2. 迁移旧数据：停 Redis → 把现有（匿名）卷内容复制进新命名卷 → **先用 `appendonly no` 启动加载
   RDB，`CONFIG SET appendonly yes` 触发重写生成 AOF，再切到 `deploy/redis/redis.conf` 启动**。
   A07-T8 实测：AOF 开启且没有 manifest 时 Redis 7 **不会回退加载 RDB**，直接切配置会得到空库
   （日志 `Creating AOF base file ... on server start`）。若现场不可拷贝，则按「空卷冷启动」处理，
   提前通知并接受 3.3 表中的丢失面。
3. 核验：`INFO persistence`、AOF 文件存在、`redis-check-aof` 通过、键数与抽样一致、`/health` 正常。
4. 回滚：恢复旧 compose 与旧匿名卷（保留到观察期结束）。数据不变，无需迁移回滚。

### 5.2 A10（ACL）

0. 渲染 ACL：`REDIS_PASSWORD=... REDIS_GPU_PASSWORD=... python scripts/isolation/render_redis_acl.py --out <宿主路径>`
   （产物含密码，权限 600，不进 git）。`default` 与 `cloud` 用现有密码，`gpu` 用新密码。
1. **先发 GPU worker**：`broker_settings.py`（三把私有键）、`celery_app.py`（`task_ignore_result`、
   `worker_enable_remote_control=False`）、`broker_recovery.py`（启动恢复）。选择队列空闲时发布——
   切换的一瞬间旧 `unacked` 里的在途消息不会被新命名空间接管，要么等它 ACK，要么人工搬。
2. **再切 GPU 身份**：改 GPU 机 `.env.gpu-worker` 的 `REDIS_URL` 为
   `redis://gpu:<password>@127.0.0.1:16379/0`，跑一次 T2/T3 等价检查（消费、心跳、杀掉重启恢复）。
3. **最后收紧 default**：确认云端与 GPU 都稳定后，把 `default` 用户改为 `off`（或删除）；
   `cloud` 身份保留全权。回滚到第 2 步只需改回 `.env` 的 default 密码。
4. **宿主隧道限制（T9，未在隔离环境执行）**：
   - `~/.ssh/authorized_keys`：`restrict,port-forwarding,permitopen="127.0.0.1:6379" ssh-ed25519 ... gpu-tunnel`
   - `sshd_config`：`PermitOpen 127.0.0.1:6379`、`AllowTcpForwarding local`、`PermitTTY no`、
     `X11Forwarding no`、`PermitTunnel no`
   - 验证：`ssh -N -L 16379:127.0.0.1:6379` 成功；`-L 15432:127.0.0.1:5432`、`-D`、`-R`、shell 全部被拒。
5. **回调密钥轮换**：两侧同时替换 `TRANSCRIPTION_CALLBACK_SECRET`（云端 env 与 GPU
   `.env.gpu-worker`），旧值立即失效；窗口内 GPU 回调会收到 401 并按其重试策略重试。
6. 回滚：恢复渲染前的 ACL / `.env` 与 GPU 旧配置，`default` 重新可用；无数据变更。

## 6 不在本方案内

- A09 的告警通道与异地备份（另有任务；A07 的积压告警投递依赖它）。
- 缓存与 broker 拆成两个 Redis 实例（明确不做，理由见 3.1）。
- SSH 账号体系重构（只验证受限 key；不改账号模型）。
- exactly-once 语义；A07 只承诺「可恢复 + 允许损失窗口明确」。
- 生产执行本身：本文件通过后，放量仍需负责人确认窗口并走 `/deploy`。

## 7 验收产物

- `docs/evidence/iteration-3/a07-<日期>.json` / `a10-<日期>.json`：每条用例的命令、原始输出、判定。
- `deploy/redis/redis.conf` 与 `deploy/redis/users.acl.template` 的最终版本（A10 以 ACL LOG 收敛后的允许集为准）。
- GPU 侧三项配置的 diff 与桩 worker 的运行日志。
- 放量检查清单（第 5 节）与一次隔离环境里的回滚演练记录。

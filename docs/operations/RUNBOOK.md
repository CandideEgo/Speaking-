# SeeWord

> 本文档面向运维人员，覆盖日常操作、健康检查、故障响应、扩容指引和数据备份。
>
> 关联文档：[PRODUCTION.md](PRODUCTION.md) · [.agent/system-map.md](../../.agent/system-map.md)（架构现状） · [SECURITY.md](SECURITY.md)

---

## 1. 日常操作

### 1.1 部署（异地构建 + 传镜像）

**服务器不具备构建能力**：`/opt/speaking` 是源码副本（无 `.git`），且规格只有 2C/1.6GB
+ swap。在服务器上 `docker compose build` 会打满内存、把宿主机冻住（2026-09-20 实测两次），
因此镜像一律在本地/CI 构建好再传上去，服务器上只做 `docker load` + 起服务。

运行时真正依赖的只有**镜像**加上这几个文件：`docker-compose.prod.yml`、`.env`、
`nginx*.conf`（由 `.env` 的 `NGINX_CONF` 选择）、`nginx/ssl/`、`promtail.yml`，
以及 bind-mount 的 `backend/data/`（ECDICT + 题库，822MB，仅在数据更新时才同步）。
`backend/`、`frontend/` 源码在服务器上不参与运行，不必保持同步。

```bash
SRV=root@47.122.109.52     # 部署对象 = DNS 解析到的那台，先 `dig +short seeword.top` 确认（见 §6.6）；密码在密码库
```

#### 步骤 1 — 本地构建 amd64 镜像

```bash
# backend / celery / celery-beat 共用同一个镜像
docker build --platform linux/amd64 -f backend/Dockerfile.cloud -t speaking-backend:latest backend/
docker tag speaking-backend:latest speaking-celery:latest
docker tag speaking-backend:latest speaking-celery-beat:latest

# frontend 单独构建（Next.js standalone 产物）
docker build --platform linux/amd64 -f frontend/Dockerfile.prod -t speaking-frontend:latest frontend/

docker save speaking-backend:latest speaking-celery:latest speaking-celery-beat:latest \
           speaking-frontend:latest | gzip -1 > images.tgz
sha256sum images.tgz
```

- 本地是 Windows/macOS 时必须显式 `--platform linux/amd64`，服务器是 x86_64。
- 拉不到基础镜像时（`node:22-alpine`、`python:3.12.12-slim`）可经
  `docker.m.daocloud.io/library/<name>` 拉取后 `docker tag` 回原名；**基础镜像 digest 必须
  与服务器上已有的一致**（`docker image inspect` 看 `RepoDigests`），否则运行期会漂。
- `images.tgz` 约 424MB（未压缩约 1.9GB）。

#### 步骤 2 — 传输 + 校验

```bash
rsync -P --partial images.tgz $SRV:/root/         # 断点续传；约 400KB/s ≈ 17 分钟
MSYS_NO_PATHCONV=1 ssh $SRV 'sha256sum /root/images.tgz'   # 与步骤 1 的 sha256 比对
```

MSYS/Git Bash 下凡命令里出现远程绝对路径，都要加 `MSYS_NO_PATHCONV=1`，否则路径会被本地转换。

#### 步骤 3 — 同步配置（仅当 compose / nginx / promtail / data 有改动）

```bash
rsync -P docker-compose.prod.yml nginx.ssl.conf promtail.yml $SRV:/opt/speaking/
rsync -a --delete backend/data/ $SRV:/opt/speaking/backend/data/   # 仅数据文件变化时
```

#### 步骤 4 — 切换（在服务器上执行）

**必须在 `nohup` 后台跑并轮询日志**：`docker load` 1.9GB 比 SSH 会话的读超时更长，前台跑会被
打断在中间状态（2026-09-20 实际发生过：`up -d` 只完成一半）。

```bash
ssh $SRV
cd /opt/speaking
TS=$(date +%Y%m%d%H%M%S)

# 4.1 备份 + 固化回滚标签（回滚见 §1.2）
mkdir -p /root/backups
cp .env /root/backups/env.$TS
cp docker-compose.prod.yml /root/backups/compose.$TS.yml
for s in backend celery celery-beat frontend; do docker tag speaking-$s:latest speaking-$s:pre-deploy; done

# 4.2 载入新镜像并核对 ID
gunzip -c /root/images.tgz | docker load
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -E 'speaking-(backend|celery|celery-beat|frontend):latest'

# 4.3 先把迁移跑完：迁移失败要在起服务之前发现，而不是起完才发现
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  --entrypoint /app/entrypoint.sh backend migrate-only

# 4.4 起服务（db / redis 不动；镜像 ID 变化会触发四个应用容器重建）
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

- **不要 `docker compose down`**：nginx 的 upstream 写着 `backend:8000`，backend 不存在时 nginx 会
  以 `[emerg] host not found in upstream` 崩溃循环，还会连带把 db / redis 停掉。
- 迁移只有 `backend` 一个执行者（`celery` / `celery-beat` 设了 `RUN_MIGRATIONS=0`，且要等 backend
  健康后才启动）。4.3 是额外保险，4.4 里 backend 还会再跑一次，在 head 上即空操作。见 §1.3。
- 核验通过后删掉服务器上的 `/root/images.tgz`（424MB）。

#### 步骤 5 — 核验

```bash
docker compose -f docker-compose.prod.yml ps                  # 全 Up，backend/db/redis healthy
docker compose -f docker-compose.prod.yml exec backend alembic current   # 在 head
docker inspect speaking-backend-1 --format '{{.Image}}'       # 与本地镜像 ID 一致
curl -fsS https://seeword.top/health                          # {"status":"ok"}
curl -fsS -o /dev/null -w '%{http_code}\n' https://seeword.top/login
docker exec speaking-celery-1 celery -A app.tasks.celery_app inspect ping   # 1 node online
```

### 1.2 回滚

镜像回滚（首选，秒级）：`pre-deploy` 标签固化的是上一次部署的镜像。

```bash
cd /opt/speaking
for s in backend celery celery-beat frontend; do docker tag speaking-$s:pre-deploy speaking-$s:latest; done
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

新版本引入的表/列是纯增量（旧代码忽略它们），**回滚通常不需要动数据库**。确实要退数据库时先备份：

```bash
docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > /root/backups/pg_rollback_$(date +%Y%m%d%H%M%S).sql.gz

docker compose -f docker-compose.prod.yml exec backend alembic downgrade -1   # 每步退一个 revision
```

### 1.3 数据库迁移

```bash
# 升级到最新版本
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# 回退一个版本
docker compose -f docker-compose.prod.yml exec backend alembic downgrade -1

# 查看当前版本 / 有无分叉
docker compose -f docker-compose.prod.yml exec backend alembic current
docker compose -f docker-compose.prod.yml exec backend alembic heads
```

迁移由容器 entrypoint 自动执行，**归属权固定在 `backend`**：`celery` / `celery-beat` 带
`RUN_MIGRATIONS=0` 并 `depends_on backend: service_healthy`。三个容器同时跑
`alembic upgrade head` 会在同一 revision 上竞争（唯一约束冲突、半迁移），不要退回那种做法。

### 1.4 种子内容

```bash
# 种子官方视频（需管理员 JWT）
curl -X POST https://api.your-domain.com/api/v1/videos/seed \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt>" \
  -d '{"source_url": "https://www.youtube.com/watch?v=xxx"}'
```

### 1.5 生成兑换码

```bash
# 生成兑换码（需管理员 JWT）
curl -X POST https://api.your-domain.com/api/v1/invite-codes/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-jwt>" \
  -d '{"count": 10, "plan": "pro", "duration_days": 30}'
```

### 1.6 密钥轮换

JWT 密钥轮换会使所有已签发的 token 失效，用户需重新登录。

```bash
# 1. 生成新的 JWT_SECRET
openssl rand -hex 32

# 2. 更新 .env 文件
#    JWT_SECRET=<新生成的密钥>

# 3. 重启后端服务
docker compose -f docker-compose.prod.yml restart backend celery

# 4. 验证旧 token 已失效
curl -H "Authorization: Bearer <old-token>" https://api.your-domain.com/api/v1/users/me
# 期望: 401 Unauthorized
```

---

## 2. 健康检查与监控

### 2.1 健康检查端点

```bash
# 基础探活
curl https://api.your-domain.com/health
# 期望: {"status": "ok"}

# Docker 内部健康检查
docker ps --format "table {{.Names}}\t{{.Status}}"
```

各组件健康检查：

| 组件 | 检查方式 | 期望结果 |
|------|---------|---------|
| Backend | `GET /health` | `{"status": "ok"}` |
| PostgreSQL | `pg_isready -U "${DB_USER:-seeword}" -d "${DB_NAME:-seeword}"`（按 .env 实际值替换） | accepting connections |
| Redis | `redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping` | PONG |
| Celery | `celery -A app.tasks.celery_app inspect ping` | pong |

> ⚠️ 生产 Redis 带 `--requirepass`，所有 `redis-cli` 命令必须带 `-a "$REDIS_PASSWORD" --no-auth-warning`；
> PostgreSQL 用户/库名由 `.env` 的 `DB_USER`/`DB_NAME` 决定（开发环境为 `seeword`），下文所有
> `psql/pg_dump -U speaking -d speaking` 请按实际值替换。

### 2.2 Sentry 告警配置

当前配置：`traces_sample_rate=0.1`（10% 采样），`profiles_sample_rate=0.1`。

建议告警规则：

| 告警 | 条件 | 通知方式 |
|------|------|---------|
| 错误率飙升 | 5 分钟内错误数 > 阈值 | 邮件 / 飞书 |
| Celery 任务失败 | `task_failed` 事件 | 邮件 |
| API 延迟过高 | p95 > 5s | 邮件 |
| 支付回调异常 | `payment_callback_error` | 邮件 + 短信 |

### 2.3 关键日志模式

生产环境使用 structlog JSON 格式输出。关注以下模式：

| 日志关键词 | 含义 | 严重度 |
|-----------|------|--------|
| `WhisperModel` 加载失败 | 语音识别模型不可用 | 严重 |
| `Celery` + `WorkerLostError` | Worker 进程崩溃 | 严重 |
| `ConnectionPool` + `timeout` | 数据库连接池耗尽 | 严重 |
| `OpenAI` + `429` / `5xx` | AI API 限流或宕机 | 高 |
| `payment` + `callback` + `error` | 支付回调异常 | 高 |
| `rate_limit_exceeded` | 频繁触发限流 | 中 |
| `alembic` + `revision` | 数据库迁移问题 | 中 |

查看日志命令：

```bash
# 后端日志
docker compose -f docker-compose.prod.yml logs -f backend --tail 100

# Celery worker 日志
docker compose -f docker-compose.prod.yml logs -f celery --tail 100

# Nginx 访问日志
docker compose -f docker-compose.prod.yml logs -f nginx --tail 100

# 按时间过滤
docker compose -f docker-compose.prod.yml logs backend --since 30m
```

---

## 3. 故障响应剧本

### 3.1 Whisper 转录队列堆积

**症状**: 视频长时间停留在 `processing` 状态，口语练习响应超时。

**诊断**:

```bash
# 检查 Celery 队列长度
docker exec -it $(docker ps -qf "name=celery") \
  celery -A app.tasks.celery_app inspect reserved

# 检查 Redis 中的任务队列
docker exec -it $(docker ps -qf "name=redis") \
  redis-cli llen celery

# 检查 Celery worker 状态
docker exec -it $(docker ps -qf "name=celery") \
  celery -A app.tasks.celery_app inspect active
```

**处理步骤**:

1. 确认 worker 进程存活：`docker ps | grep celery`
2. 如 worker 卡死，重启：`docker compose -f docker-compose.prod.yml restart celery`
3. 如队列持续堆积，考虑增加 worker 节点（见扩容指引 4.1）
4. 长期方案：迁移至 GPU 推理（见扩容指引 4.2）

### 3.2 Celery Worker 崩溃 / OOM

**症状**: Sentry 报 `WorkerLostError`，视频处理任务无进展。

**诊断**:

```bash
# 检查 worker 容器状态
docker inspect $(docker ps -aqf "name=celery") --format '{{.State.OOMKilled}}'

# 检查 Redis 中积压的任务（生产 Redis 有密码）
docker exec -it $(docker ps -qf "name=redis") redis-cli -a "$REDIS_PASSWORD" --no-auth-warning llen celery

# 检查容器内存使用
docker stats --no-stream $(docker ps -qf "name=celery")
```

**处理步骤**:

1. 重启 worker：`docker compose -f docker-compose.prod.yml restart celery`
2. 如 OOM，增加 Docker 内存限制或服务器内存
3. Whisper int8 模型常驻约 1.5GB，确保 worker 容器至少分配 3GB 内存
4. 检查是否有异常大的音频文件导致内存飙升

### 3.3 AI API 限流或宕机

**症状**: 口语评分返回错误，字幕翻译失败，AI 词汇查询超时。

**诊断**:

```bash
# 检查 AI API 可达性
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  $OPENAI_BASE_URL/models

# 检查后端日志中的 AI API 错误
docker compose -f docker-compose.prod.yml logs backend --tail 200 | \
  grep -i "openai\|429\|5xx\|timeout"
```

**处理步骤**:

1. 检查 API Key 配额是否耗尽（登录 AI 厂商控制台）
2. 切换到备用提供商（修改环境变量，无需改代码）：

```bash
# 切换到 OpenAI
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# 或切换到 DeepSeek
OPENAI_API_KEY=dsk-xxx
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat

# 重启后端和 Celery 使新配置生效
docker compose -f docker-compose.prod.yml restart backend celery
```

3. 如所有 AI API 不可用，口语评分和翻译功能降级，前端应显示友好提示

### 3.4 PostgreSQL 连接池耗尽

**症状**: API 返回 500，日志出现 `ConnectionPool` + `timeout` 错误。

**诊断**:

```bash
# 检查活跃连接数
docker exec -it $(docker ps -qf "name=db") \
  psql -U speaking -d speaking -c "SELECT count(*) FROM pg_stat_activity;"

# 检查连接状态分布
docker exec -it $(docker ps -qf "name=db") \
  psql -U speaking -d speaking -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"

# 检查最大连接数
docker exec -it $(docker ps -qf "name=db") \
  psql -U speaking -d speaking -c "SHOW max_connections;"
```

**处理步骤**:

1. 终止空闲连接：

```bash
docker exec -it $(docker ps -qf "name=db") \
  psql -U speaking -d speaking -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='idle' AND query_start < now() - interval '10 minutes';"
```

2. 重启后端释放连接池：`docker compose -f docker-compose.prod.yml restart backend`
3. 调整连接池大小（在 `config.py` 或环境变量中设置 `DB_POOL_SIZE`）
4. Gunicorn 2 workers（`docker-compose.prod.yml` 实际 `-w 2`），每个 worker 默认连接池大小 5，总连接数 = 2 x 5 = 10，确保 `max_connections` > 总连接数

### 3.5 支付回调未收到

**症状**: 用户付款成功但未升级 Pro，订单状态仍为 `pending`。

**诊断**:

```bash
# 查看订单状态
docker exec -it $(docker ps -qf "name=db") \
  psql -U speaking -d speaking -c \
  "SELECT id, user_id, amount, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10;"

# 检查后端日志中的回调记录
docker compose -f docker-compose.prod.yml logs backend --tail 500 | grep -i "payment\|callback"
```

**处理步骤**:

1. 确认回调 URL 可从支付平台访问（检查 Nginx 配置、防火墙规则）
2. 验证签名配置（RSA2 + HMAC-SHA256 已实现；生产环境确认 `PAYMENT_VERIFY_SIGNATURE=true`，开发模式可禁用但日志警告）
3. 手动更新订单状态（紧急处理）：

```bash
docker exec -it $(docker ps -qf "name=db") \
  psql -U speaking -d speaking -c \
  "UPDATE orders SET status='paid' WHERE id='<order-id>';"

docker exec -it $(docker ps -qf "name=db") \
  psql -U speaking -d speaking -c \
  "UPDATE users SET plan='pro' WHERE id='<user-id>';"
```

4. 事后复盘：确认支付回调签名验证配置正确（RSA2/HMAC-SHA256 已实现，确认 `PAYMENT_VERIFY_SIGNATURE=true`）

---

## 4. 扩容指引

### 4.1 何时增加 Celery Worker

**指标**:
- Redis 队列长度持续 > 10
- 视频处理平均耗时 > 10 分钟
- 口语练习排队等待 > 5 秒

**操作**:

```bash
# 方式一：增加单节点 worker 并发数
# 修改 docker-compose.prod.yml celery command:
#   celery -A app.tasks.celery_app worker --loglevel=warning --concurrency=2

# 方式二：增加 worker 容器实例
# 在 docker-compose.prod.yml 中添加:
#   celery-worker-2:
#     build: { context: ./backend }
#     command: celery -A app.tasks.celery_app worker --loglevel=warning
#     ... (同 celery 服务的 environment 和 volumes)
```

**注意**: 每个 worker 进程会加载独立的 Whisper 模型（约 1.5GB 内存），确保服务器内存充足。

### 4.2 何时迁移 Whisper 至 GPU

**指标**:
- CPU 转录速度 < 1x 实时（即 1 分钟音频需 > 1 分钟转录）
- 并发口语练习请求排队严重
- 服务器 CPU 持续 > 80%

**操作**:

1. 选择带 NVIDIA GPU 的服务器（如 T4 / A10G）
2. 修改 `speaking_service.py` 模型加载配置：
   - `device="cuda"`
   - `compute_type="float16"`（GPU 推理推荐精度）
3. Docker 镜像需安装 CUDA 运行时
4. GPU 转录速度约 < 0.5 秒/分钟音频，可显著提升吞吐

### 4.3 何时添加 PostgreSQL 只读副本

**指标**:
- 数据库 CPU 持续 > 60%
- 慢查询增多（p95 > 500ms）
- 读写比 > 5:1

**操作**:

1. 配置 PostgreSQL 流复制（streaming replication）
2. 修改后端数据库连接配置，读操作路由至副本
3. SQLAlchemy async 支持配置 `bind` 区分读写

### 4.4 何时启用 OSS CDN

**指标**:
- 视频加载缓慢（首屏 > 3s）
- 服务器带宽成为瓶颈
- 用户分布跨地域

**操作**:

1. 开通阿里云 OSS / 腾讯云 COS
2. 配置环境变量：

```bash
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET=your-bucket
OSS_ACCESS_KEY=xxx
OSS_SECRET_KEY=xxx
```

3. 修改 `video_processing.py` 上传逻辑，视频处理完成后上传至 OSS
4. 配置 CDN 域名回源至 OSS
5. 前端视频 URL 从 `/media/` 切换至 CDN 域名

---

## 5. 数据备份与恢复

### 5.1 PostgreSQL 备份

**手动备份**:

```bash
# 全量备份
docker exec $(docker ps -qf "name=db") \
  pg_dump -U speaking speaking > backup_$(date +%Y%m%d_%H%M%S).sql

# 压缩备份
docker exec $(docker ps -qf "name=db") \
  pg_dump -U speaking speaking | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

**定时备份（crontab）**:

```bash
# 每天凌晨 3 点自动备份
0 3 * * * docker exec $(docker ps -qf "name=db") pg_dump -U speaking speaking | gzip > /opt/backups/pg_backup_$(date +\%Y\%m\%d).sql.gz
```

**恢复**:

```bash
# 从备份恢复
cat backup_20260604_030000.sql | \
  docker exec -i $(docker ps -qf "name=db") \
  psql -U speaking speaking

# 从压缩备份恢复
gunzip -c backup_20260604_030000.sql.gz | \
  docker exec -i $(docker ps -qf "name=db") \
  psql -U speaking speaking
```

### 5.2 媒体文件备份

**手动备份**:

```bash
# rsync 到备份存储
rsync -avz --progress /opt/speaking/media/ /opt/backups/media/

# 或同步到远程服务器
rsync -avz --progress /opt/speaking/media/ user@backup-server:/backups/speaking/media/
```

**定时备份（crontab）**:

```bash
# 每天凌晨 4 点增量同步
0 4 * * * rsync -avz /opt/speaking/media/ /opt/backups/media/
```

**恢复**:

```bash
# 从备份恢复
rsync -avz /opt/backups/media/ /opt/speaking/media/

# 如使用 Docker volume
docker cp /opt/backups/media/. $(docker ps -qf "name=backend"):/app/media/
```

### 5.3 备份验证

建议每周验证一次备份可恢复性：

```bash
# 1. 创建临时数据库容器
docker run -d --name pg-verify \
  -e POSTGRES_USER=speaking \
  -e POSTGRES_PASSWORD=xxx \
  -e POSTGRES_DB=speaking_verify \
  postgres:16-alpine

# 2. 恢复备份
cat backup_latest.sql | docker exec -i pg-verify psql -U speaking speaking_verify

# 3. 验证数据完整性
docker exec -it pg-verify psql -U speaking speaking_verify -c \
  "SELECT count(*) FROM users; SELECT count(*) FROM videos; SELECT count(*) FROM orders;"

# 4. 清理
docker rm -f pg-verify
```

---

## 6. 视频生产流水线（持续策展 → 上线）

> **何时用**：日常从 catalog 候选池挑视频跑完整管线（WhisperX 转录 + ark 翻译 + prewarm + 下载 + 转码 + 发布），让新视频持续上 `https://seeword.top` 首页。
>
> 端到端流程对应 ADR-0017（catalog 候选池）+ ADR-0018（ark 翻译引擎）。本文记录 2026-09-08 跑通 `2c291371` Rachel's English 视频的完整命令序列，可作为后续生产的模板。

### 6.1 整体流程

```
┌────────────────────────┐   ┌──────────────────────────┐   ┌────────────────────────┐
│  1. 选视频（本地）      │   │  2. 本地端到端处理        │   │  3. 推送到生产          │
│  catalog browse / SQL  │──▶│  WhisperX → ark 翻译    │──▶│  DB INSERT + media     │
│                        │   │  prewarm + 下载 + 转码  │   │  cp + nginx reload     │
└────────────────────────┘   └──────────────────────────┘   └────────────────────────┘
                                                              │
                                                              ▼
                                                  https://seeword.top 首页可见
```

### 6.2 前置条件

| 工具 / 服务 | 用途 | 状态检查 |
|-------------|------|---------|
| Docker Desktop | PG + Redis 容器 | `docker ps \| grep speaking-db-1` |
| 本地后端 `.env` 含 ark 配置 | translation + prewarm 引擎 | 见 §6.3 |
| YouTube cookies 文件 | yt-dlp 下载 | `backend/youtube_cookies_new.txt` 有效 |
| 本地 NVIDIA GPU + WhisperX 环境 | GPU 转录 | `device=cuda` 出现在 celery log |
| 生产服务器 SSH 凭据 | push 媒体 + DB | `ssh seeword` / `ssh root@47.122.109.52` |

### 6.3 ARK 引擎配置（一次性，已落地）

参见 [ADR-0018](../adr/0018-ark-cody-translation-engine.md) — 翻译 / prewarm 统一走火山引擎 ARK (`https://ark.cn-beijing.volces.com/api/coding/v3`)。**零代码改动**，只改 `.env` + `docker-compose.prod.yml`。

`backend/.env` 关键 7 行（gitignored）：

```ini
TRANSLATION_ENGINE=custom
TRANSLATION_FALLBACK_ENGINE=                                       # 空字符串禁用默认 fallback
TRANSLATION_CUSTOM_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
TRANSLATION_CUSTOM_MODEL=ark-code-latest
TRANSLATION_CUSTOM_API_KEY=<ARK endpoint ID / API key，见密码库，勿写入仓库>
PREWARM_ENGINES=custom
TRANSLATION_BATCH_SIZE=5
```

生产 `docker-compose.prod.yml` 必须在 `backend` / `celery` / `celery-beat` 三个 service 的 `environment:` 块中**显式**列出 5 个新 env（compose 用 `${VAR:-default}` 注入到容器，**不是** `env_file`）：

```yaml
TRANSLATION_BATCH_SIZE: ${TRANSLATION_BATCH_SIZE:-5}
TRANSLATION_CUSTOM_BASE_URL: ${TRANSLATION_CUSTOM_BASE_URL:-}
TRANSLATION_CUSTOM_MODEL: ${TRANSLATION_CUSTOM_MODEL:-}
TRANSLATION_CUSTOM_API_KEY: ${TRANSLATION_CUSTOM_API_KEY:-}
PREWARM_ENGINES: ${PREWARM_ENGINES:-agnes,qwen}
```

> 否则容器里 `get_settings()` 看不到 ark 配置（容器内 `TRANSLATION_ENGINE` 仍是 `agnes`）。

### 6.4 步骤 1：选视频

**从 catalog 候选池挑（推荐）**：

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/sms/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"<admin_phone>","code":"1234"}' | python -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 列前 10 条 fit 排序
curl -s -b "seeword_admin_token=$TOKEN" \
  "http://localhost:8000/api/v1/admin/catalog?sort=fit&page_size=10" | jq .
```

挑一条 `status=new` + `subs_available=true` + `duration_sec BETWEEN 180 AND 600`（3-10 分钟）+ 教育向 channel_name。

记录 `ITEM_ID`、`source_url`、期望 `video_id`（promote 后返回）。

### 6.5 步骤 2：本地端到端处理

**触发 promote**（让 celery 跑 head → GPU callback → tail）：

```bash
curl -s -X POST -b "seeword_admin_token=$TOKEN" \
  "http://localhost:8000/api/v1/admin/catalog/$ITEM_ID/promote" \
  -H "Content-Type: application/json" \
  -d '{"auto_publish": true}' | jq .
```

**监控进度**（celery log）：

```bash
tail -f logs/celery.log | grep -E "TranslationService initialized|chat.completions|WhisperX|finalized|cookies valid"
```

**关键阶段日志**（约 4-8 分钟完成）：

```
TranslationService initialized engine=Custom Endpoint     # 翻译 init
WhisperX ASR complete batch_size=16 language=en segment_count=N
cookies valid                                              # head 验证通过
Transcoded 720p: <video_id>_720p.mp4                       # 转码完成
Video <video_id> finalized                                 # pipeline 成功
```

**验证终态**：

```bash
cd backend && PYTHONPATH=. python -c "
import asyncio
from app.core.database import async_session
from sqlalchemy import text
async def main():
    async with async_session() as db:
        r = await db.execute(text('SELECT id, status, is_published, duration FROM videos WHERE id = :vid'), {'vid': '<video_id>'})
        print(r.first())
asyncio.run(main())
"
# 期望: status=ready, is_published=True, duration=186 等
```

### 6.6 步骤 3：推送到生产

生产服务器实际指向（DNS 解析到的）：

| 服务器 | 部署路径 | 容器前缀 | 凭据 |
|--------|---------|---------|------|
| **47.122.109.52**（当前 DNS 解析） | `/opt/speaking` | `speaking-*` | root / 见密码库（勿写入仓库） |
| 47.122.127.105（旧） | `~/seeword` | `seeword-*` | admin / 见密码库（旧服务器部署文档不在本仓库） |

> 推送前必须先 `dig +short seeword.top` 确认 DNS 指向哪台。**只推 DNS 解析到的那台**。

#### 3a. 导出 SQL（只含目标 video + subtitles + 关联 channel）

```bash
cd backend && PYTHONPATH=. python -c "
import asyncio
from pathlib import Path
from sqlalchemy import text
from app.core.database import async_session

VIDEO_ID = '<video_id>'

def sql_quote(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)): return repr(v)
    if isinstance(v, (dict, list)):
        import json
        return f\"'{json.dumps(v, ensure_ascii=False).replace(chr(39), chr(39)*2)}'\"
    return f\"'{str(v).replace(chr(39), chr(39)*2)}'\"

async def export(video_id, out_path):
    lines = [f'-- Export for video {video_id}\n', 'BEGIN;\n']
    async with async_session() as db:
        # channel
        r = await db.execute(text('SELECT * FROM channels WHERE id = (SELECT channel_ref FROM videos WHERE id = :v)'), {'v': video_id})
        ch = r.mappings().first()
        if ch:
            cols = list(ch.keys()); vals = [sql_quote(ch[c]) for c in cols]
            lines.append(f'INSERT INTO public.channels ({', '.join(cols)}) VALUES ({', '.join(vals)}) ON CONFLICT (id) DO NOTHING;\n')
        # video
        r = await db.execute(text('SELECT * FROM videos WHERE id = :v'), {'v': video_id})
        v = r.mappings().first()
        cols = list(v.keys()); vals = [sql_quote(v[c]) for c in cols]
        lines.append(f'INSERT INTO public.videos ({', '.join(cols)}) VALUES ({', '.join(vals)}) ON CONFLICT (id) DO NOTHING;\n')
        # subtitles
        r = await db.execute(text('SELECT * FROM subtitles WHERE video_id = :v ORDER BY sentence_index'), {'v': video_id})
        for s in r.mappings().all():
            cols = list(s.keys()); vals = [sql_quote(s[c]) for c in cols]
            lines.append(f'INSERT INTO public.subtitles ({', '.join(cols)}) VALUES ({', '.join(vals)}) ON CONFLICT (id) DO NOTHING;\n')
    lines.append('COMMIT;\n')
    Path(out_path).write_text(''.join(lines), encoding='utf-8')

asyncio.run(export(VIDEO_ID, '/tmp/video_export.sql'))
"
```

#### 3b. 不要删列 — 全列导出

> **2026-09-09 更正**：本节原先要求 `sed` 删掉 `videos.is_demo` 和 `channels.is_auto`，
> 理由是生产 schema 落后。**生产已迁移，这两列现在都存在**，照旧执行 sed 会得到
> `INSERT has more expressions than target columns` 而不是修好问题。
>
> 现在的做法：**全列导出，不做任何 sed**。3a 的脚本用 `SELECT *` + `v.keys()`，
> 列名与值天然对齐，无需干预。若将来又出现 schema 漂移，先比对再改，别照抄命令：
>
> ```bash
> # 本地
> psql -U seeword -d seeword -tAc "SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name='videos'"
> # 生产（同一条，套 docker exec）
> ssh root@47.122.109.52 "docker exec speaking-db-1 psql -U seeword -d seeword -tAc \"SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name='videos'\""
> ```

#### 3c. 上传媒体 + SQL + 导入

**SQL 必须用管道喂给 psql，不能 `docker cp` + `psql -f`。** 后者会报
`INSERT has more expressions than target columns`，即使列数与值数确认一致、
同一条语句用 `psql -c` 单独执行也正常（2026-09-08 实测，原因未查明，疑似
`docker cp` 对含 UTF-8 内容的文件有处理差异）。管道方式 48 条视频零失败：

```bash
# 本地：推 SQL 到生产主机（scp 常报 Permission denied，用 paramiko SFTP 更稳）
scp /tmp/video_export.sql root@47.122.109.52:/tmp/

ssh root@47.122.109.52
# 在生产服务器上 —— 注意是 cat | docker exec -i，不是 docker cp
cat /tmp/video_export.sql | docker exec -i speaking-db-1 psql -U seeword -d seeword
# 期望: INSERT 0 1 × N 行 + COMMIT
```

媒体文件名**不要按 id 拼**，要从 DB 读 `video_url_720p` / `thumbnail_url`：
低于 720p 的源会跳过转码（`video_url_720p` 指向 `<id>.mp4`），封面新的是
`.webp` 旧的是 `.jpg`。磁盘上可能只有 `<id>_raw.mp4`，需回退查找。

```bash
# 本地查真实文件名
psql -U seeword -d seeword -tAc "SELECT video_url_720p, thumbnail_url FROM videos WHERE id='<video_id>'"

scp backend/media/<实际文件名> root@47.122.109.52:/tmp/
ssh root@47.122.109.52
# 容器内必须用 DB 记录的名字（本地是 _raw 副本时尤其注意）
docker cp /tmp/<文件名> speaking-backend-1:/app/media/<DB里的文件名>
rm /tmp/<文件名>
```

> 大文件 SFTP 超时率不低。**只推 SQL 不推媒体会留下"站上可见但播不了"的半成品**
> （2026-09-09 实测遇到一次）。上传后务必验证，见 3e。

#### 3d. 重载 nginx 清缓存

```bash
docker exec speaking-nginx-1 nginx -s reload
```

#### 3e. 验证（三项都要查）

```bash
# 1. 详情端点：200 + is_published
curl -s https://seeword.top/api/v1/videos/<video_id> | python -c "import sys,json;d=json.load(sys.stdin);print(d['is_published'], d['duration'])"

# 2. 封面：必须 200（这是唯一不受解锁门限制的资源）
curl -s -o /dev/null -w "%{http_code}\n" https://seeword.top/media/<thumb 文件名>

# 3. mp4：403 = 正常（解锁门），404 = 文件没落地，必须重推
curl -s -o /dev/null -w "%{http_code}\n" https://seeword.top/media/<mp4 文件名>
```

**不要把 feed 排名当验证条件。** 首页 feed 是排序结果，新视频会被挤出前 N 位，
拿它判成败会随着上线量增长误杀健康视频（2026-09-09 踩过）。

全量核对媒体是否齐全：

```bash
ssh root@47.122.109.52 '
  docker exec speaking-db-1 psql -U seeword -d seeword -tAc "
    SELECT regexp_replace(video_url_720p,'"'"'^/media/'"'"','"'"''"'"') FROM videos WHERE status='"'"'ready'"'"' AND is_published AND video_url_720p LIKE '"'"'/media/%'"'"'
    UNION ALL
    SELECT regexp_replace(thumbnail_url,'"'"'^/media/'"'"','"'"''"'"') FROM videos WHERE status='"'"'ready'"'"' AND is_published AND thumbnail_url LIKE '"'"'/media/%'"'"'" | sort > /tmp/want.txt
  docker exec speaking-backend-1 ls /app/media/ | sort > /tmp/have.txt
  echo "referenced: $(wc -l < /tmp/want.txt) | missing:"; comm -23 /tmp/want.txt /tmp/have.txt
'
```

> 否则 `proxy_cache_valid 404 1m` 会缓存首次 404 — DB 写入后仍未 200。

### 6.7 步骤 4：验证

```bash
# 视频详情（应 200）
curl -s -m 5 -k "https://seeword.top/api/v1/videos/<video_id>" | jq .

# 首页 feed（应包含新 video）
curl -s -m 5 -k "https://seeword.top/api/v1/browse/feed?limit=5" | jq '.items[].id'

# 缩略图（应 200，~20KB）
curl -s -m 5 -k -I "https://seeword.top/media/<video_id>_thumb.jpg"

# 720p mp4 预期 403（unlock gate）— 登录后即可看
curl -s -m 5 -k -I "https://seeword.top/media/<video_id>_720p.mp4"
```

### 6.8 故障与处理

| 症状 | 根因 | 修复 |
|------|------|------|
| `Translation engine 'hy_mt2' has no API key` | `TRANSLATION_FALLBACK_ENGINE` 默认 'hy_mt2' | `.env` 显式 `TRANSLATION_FALLBACK_ENGINE=` 置空 |
| 容器内 `TRANSLATION_ENGINE` 仍是 `agnes` | docker-compose 没列新 env | 在三个 service 各加 5 行 `${TRANSLATION_CUSTOM_*:-}` |
| `tasks, accept, hostname = _loc` 报错 | celery 5.4.0 + Windows + `--loglevel=info` | 改用 `--pool=solo` 或 `--loglevel=warning` |
| `column "is_auto" of relation "channels" does not exist` | 生产 schema 旧（2026-09 前） | 走管道导入（`cat ... \| docker exec -i psql`），不要 `docker cp` + `psql -f` |
| `current transaction is aborted` | BEGIN 后某行失败 | 看第一次 ERROR，删错的列/值，再重跑 |
| `INSERT has more expressions than target columns` | 列数不匹配，或 `docker cp` 文件编码问题 | 用 `cat ... \| docker exec -i psql` 管道导入，不要 `docker cp` + `psql -f` |
| 视频详情 200 + 已发布，但封面 / mp4 404 | SQL 进了但媒体上传超时，半成品 | 补传媒体文件；先 `docker exec speaking-nginx-1 nginx -s reload` 清旧缓存再验证 |
| 音频下载 600s 超时 | POT 拿不到 → YouTube 强制 SABR → 格式全跳过 | 确认 `proxy-relay` 和 `bgutil-provider` 容器运行中；`curl http://127.0.0.1:4416/ping`；运行 `scripts/setup_pot_proxy.ps1` 重建 |
| `Could not copy Chrome cookie database` | Edge 锁 cookie DB | 用 `Get cookies.txt` 扩展导 Netscape |
| `Sign in to confirm you're not a bot` | YouTube cookies 失效 | 重新从 Edge 导 cookies.txt 覆盖 `youtube_cookies_new.txt` |
| 视频能查但 mp4 返回 403 | D0 unlock gate | 正常行为（未登录用户不能看 mp4，登录可解锁） |
| 视频能查但 nginx 返回 404 | 旧 404 缓存 | `docker exec speaking-nginx-1 nginx -s reload` |
| `transcribe_video_gpu` 卡住不返回 | 本地无 GPU | 起云 GPU worker（参考 [GPU-WORKER-SETUP.md](GPU-WORKER-SETUP.md)） |

### 6.9 前置依赖：POT provider + 代理中继（必读）

**跑任何视频处理前必须先起这两个容器**，否则 yt-dlp 拿不到 PO Token，
YouTube 会强制 SABR 流、所有格式被跳过，下载空转到 600s 超时。

```powershell
pwsh -File backend/scripts/setup_pot_proxy.ps1
Restart-Service SeeWordCelery, SeeWordGpuWorker   # 让 worker 读到新地址
```

脚本做四件事：探测宿主当前 LAN IP → 重建 `proxy-relay` 和 `bgutil-provider`
两个容器 → **从宿主和容器两侧都验证连通** → 把地址写进 `backend/.env` 和
`.env.gpu-worker`。

**什么时候要重跑**：换网络、Docker 重启、机器重启后。因为地址是 DHCP 分配的
LAN IP，网络一变就失效 —— 这也是为什么不能把它写死在 `.env` 里。

<details>
<summary>为什么需要中继这一层（踩坑记录）</summary>

bgutil POT 插件会把 yt-dlp 自己的 `--proxy` 值转发进 provider 容器的
`/get_pot` 请求体（见插件源码 `'proxy': request.request_proxy`）。我们的上游
代理只监听 `127.0.0.1:7897`，容器收到 `127.0.0.1:7897` 后解析成**它自己**，
于是每次 POT 获取都 `ECONNREFUSED`。

所以代理地址必须是**宿主和容器都能正确解析的同一个字符串**。socat 中继提供
这个：发布在宿主所有网卡上，转发到 `host.docker.internal:7897`。

两个容易误判的点：
- **容器启动时那次 POT 会成功**（用的是自己 env 里的地址），之后每次请求都失败。
  只验证一次会得到假阳性 —— 必须两侧都测。
- **`--net=host` 在 Windows Docker Desktop 不通**；宿主 hosts 里的
  `host.docker.internal` 可能是陈旧地址（本机就指向已失联的 `192.168.1.2`）。

另外插件的 `base_url` 必须显式传，否则它访问自己默认的 `127.0.0.1:4416`
也会走 yt-dlp 的 proxy，代理回连不到宿主 loopback，每次 POT 都 20s 读超时：

```python
extractor_args = {
    "youtube": {"player_client": ["web", "android"]},   # 去掉 tv：多数视频返回 UNPLAYABLE
    "youtubepot-bgutilhttp": {"base_url": ["http://127.0.0.1:4416"]},
}
```
代码里由 `_youtube_extractor_args()` 统一构造（`app/tasks/video_processing.py`）。

</details>

**cookies 注意**：从普通浏览器窗口导出的 cookies 会被 YouTube 几分钟内轮换失效。
按 yt-dlp wiki 的做法：**无痕窗口登录 → 导出 → 关掉窗口**，可用 3-5 天。
另外 yt-dlp 的 `--cookies` 是**双向**的（退出时写回 cookie jar），anti-bot 响应里
带清 auth 的 `Set-Cookie` 会把 `LOGIN_INFO` 洗掉 —— 代码里用
`disposable_cookiefile()` 传副本规避。判断 cookies 是否有效看 `LOGIN_INFO` 是否存在。

### 6.10 批量化建议

单条约 2-6 分钟（GPU 串行），一夜可跑 40+ 条。建议：

- **节奏**：每条间隔 3 分钟即可（`INTERVAL_SEC=180` 实测无争抢）
- **等待窗口**：`MAX_WAIT_PIPELINE` 不低于 **2400s** —— 1000s 的视频光
  ASR+对齐+分批翻译就要 15 分钟，900s 会误判 timeout
- **挑选**：`subs_available=true` + 时长 < 15 分钟；内容不必局限教学向，
  脱口秀 / 新闻 / 体育 / 科普的 fit_score 同样高
- **质量门禁**：`Translation quality gate FAILED` 只有 coverage < 0.6 才算错，
  长度 outliers 是 WARN，可继续
- **worker 必须服务化托管**：从交互式 shell 起的 celery 会随命令结束被回收，
  任务卡在 `processing`。用 NSSM（`scripts/run_celery_worker.ps1`）
- **验证要区分真失败与误报**：判 error 前先 curl 详情端点 + 封面
  （见 §6.7 3e）。2026-09-09 那批 4 条 error 里 3 条是误报

### 6.11 跑通样例（2026-09-08）

- 视频：`2c291371-e576-41fd-9add-485284d3e8d9` "How to Pronounce SEX vs. SIX - American English" (Rachel's English, 186s, 35 字幕)
- 翻译：ark-code-latest 35/35 (coverage 100%, 长度 outliers 46/187 仅 WARN)
- prewarm：ark 双引擎 fallback ok
- 转码：ffmpeg 720p 17.7MB
- 推到 47.122.109.52：DB 1 channel + 1 video + 35 subtitles + 17.7MB mp4 + 21KB thumb
- 上线：`https://seeword.top/api/v1/browse/feed` 已包含新 video

### 6.12 批量实绩（2026-09-09）

首次大批量，可作为容量基线：

| 指标 | 结果 |
|------|------|
| 耗时 | 01:45 → 07:45（6 小时） |
| 上线 | 48 条（线上共 49 ready+published） |
| 失败 | 3 条，全是源视频失效（private/deleted），无法处理 |
| 字幕总数 | 4932 |
| 覆盖频道 | 23 |
| 媒体完整性 | 98 引用 / 98 在位，零缺失 |
| 已发布零字幕 | 0 条 |

内容构成（验证了非教学向选题同样可用）：脱口秀（Fallon / Ellen / Kimmel）、
新闻（MS NOW / Fox News）、体育（House of Highlights / WWE）、
科普（Veritasium / TED / National Geographic）、英语学习（少量）。

本批修掉的坑（都已回写进上文）：POT 代理中继、`_get_ytdlp_path` 漏查
`Scripts/`、worker 需服务化、feed 排名不能当验证条件、媒体上传需重试、
`MAX_WAIT_PIPELINE` 需 ≥ 2400s。

---

*最后更新：2026-09-09（§6.7 更正 sed 指令 + 管道导入；新增 §6.9 POT 前置依赖、§6.12 批量实绩）*

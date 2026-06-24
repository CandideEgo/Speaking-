# 运维手册 (Runbook) — Speaking

> 本文档面向运维人员，覆盖日常操作、健康检查、故障响应、扩容指引和数据备份。
>
> 关联文档：[PRODUCTION.md](PRODUCTION.md) · [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) · [SECURITY.md](SECURITY.md)

---

## 1. 日常操作

### 1.1 部署

```bash
cd /opt/speaking
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# 如有数据库变更
docker exec -it $(docker ps -qf "name=backend") alembic upgrade head
```

### 1.2 回滚

```bash
# 1. 停止当前服务
docker compose -f docker-compose.prod.yml down

# 2. 切换到上一个稳定版本
git log --oneline -5          # 找到目标 commit
git checkout <commit-hash>

# 3. 重新构建并启动
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# 4. 如需回滚数据库
docker exec -it $(docker ps -qf "name=backend") alembic downgrade -1
```

### 1.3 数据库迁移

```bash
# 升级到最新版本
docker exec -it $(docker ps -qf "name=backend") alembic upgrade head

# 回退一个版本
docker exec -it $(docker ps -qf "name=backend") alembic downgrade -1

# 查看当前版本
docker exec -it $(docker ps -qf "name=backend") alembic current
```

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
| PostgreSQL | `pg_isready -U speaking -d speaking` | accepting connections |
| Redis | `redis-cli ping` | PONG |
| Celery | `celery -A app.tasks.celery_app inspect ping` | pong |

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

# 检查 Redis 中积压的任务
docker exec -it $(docker ps -qf "name=redis") redis-cli llen celery

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
4. Gunicorn 4 workers，每个 worker 默认连接池大小 5，总连接数 = 4 x 5 = 20，确保 `max_connections` > 总连接数

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

*最后更新：2026-06-19*

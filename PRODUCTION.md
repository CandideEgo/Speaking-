# 生产上线指南 — Speaking

> 从当前开发状态到正式上线所需的完整准备清单和操作步骤。
>
> 关联文档：[REQUIREMENTS.md](REQUIREMENTS.md) · [PROGRESS.md](PROGRESS.md) · [SECURITY.md](SECURITY.md)

---

## 一、上线前必须项

### 1. 基础设施

| 资源 | 规格/要求 | 预估月费 |
|---|---|---|
| **云服务器** | ≥ 4C8G（Whisper 需要 CPU 资源，有 GPU 最佳），100GB 磁盘 | ¥200-500 |
| **域名** | 一个备案域名 + SSL 证书（Let's Encrypt 免费） | ¥50-100/年 |
| **OSS 存储** | 阿里云 OSS / 腾讯云 COS / AWS S3，用于视频 CDN 分发 | ¥50-200 |
| **SMTP 服务** | 发送注册验证、密码重置邮件（SendGrid / 阿里云邮件 / SES） | ¥0-50 |

### 2. 第三方服务账号

| 服务 | 用途 | 获取方式 |
|---|---|---|
| OpenAI 兼容 API Key | AI 翻译、评分、分析（当前使用 Agnes AI） | Agnes AI 官网 |
| YouTube Data API Key | 获取视频元数据（标题、时长、缩略图） | Google Cloud Console |
| 支付宝/微信支付商户 | 正式支付接入（需企业资质） | 支付宝/微信商户平台 |
| 阿里云 / 腾讯云 | OSS 存储 + 短信 + CDN 等服务 | 云厂商官网 |

### 3. 环境变量清单

创建 `.env` 文件，包含以下全部变量（参考 `backend/.env.example`）：

```bash
# —— 数据库 ——
DATABASE_URL=postgresql+asyncpg://speaking:password@db:5432/speaking

# —— Redis ——
REDIS_URL=redis://redis:6379/0

# —— JWT ——
JWT_SECRET=<生成一个 64 位强随机字符串>
JWT_ALGORITHM=HS256

# —— AI ——
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://apihub.agnes-ai.com/v1
OPENAI_MODEL=agnes-2.0-flash

# —— OSS/CDN ——
OSS_ENDPOINT=oss-cn-hongkong.aliyuncs.com
OSS_BUCKET=your-bucket
OSS_ACCESS_KEY=your-key
OSS_SECRET_KEY=your-secret

# —— 支付（上线时填入真实值） ——
ALIPAY_APP_ID=your-alipay-app-id
ALIPAY_PUBLIC_KEY=your-alipay-public-key
ALIPAY_PRIVATE_KEY=your-alipay-private-key
WECHAT_MCH_ID=your-wechat-merchant-id
WECHAT_API_V3_KEY=your-wechat-api-v3-key
WECHAT_SERIAL_NO=your-wechat-cert-serial-no
PAYMENT_VERIFY_SIGNATURE=true

# —— URL ——
API_URL=https://api.your-domain.com
FRONTEND_URL=https://your-domain.com

# —— 环境 ——
ENV=production
```

**注意:** `.env.example` 不包含任何真实密钥，所有值为占位符。生产环境必须填入真实值。

---

## 二、安全加固

### 2.1 红色警报 — 上线前必须修复

| # | 问题 | 文件 | 风险 | 状态 |
|---|---|---|---|---|
| S-01 | ~~兑换码生成接口无管理员校验~~ | `invite.py` | ✅ 已修复 | 已加 admin role 中间件检查 |
| S-02 | ~~支付回调无签名验证~~ | `payments.py` | ✅ 已修复 | RSA2 + HMAC-SHA256 签名验证已实现 |
| S-03 | ~~JWT_SECRET 可能为空~~ | `config.py` | ✅ 已修复 | 生产环境启动时 RuntimeError 校验 |
| S-04 | ~~全 API 无速率限制~~ | 全局 | ✅ 已修复 | slowapi + nginx 分层限流 |

### 2.2 黄色警告 — 建议上线前修复

| # | 问题 | 文件 | 建议 | 状态 |
|---|---|---|---|---|
| S-05 | ~~订单用内存字典无持久化~~ | `payments.py` | ✅ 已修复 | Order 模型 + 数据库存储 |
| S-06 | ~~Whisper 全局单例非线程安全~~ | `speaking_service.py` | ✅ 已修复 | 迁移至 faster-whisper |
| S-07 | 无密码重置流程 | — | 上线前用户需要的基础功能 | **待实现** |
| S-08 | ~~无用户登出~~ | 前端 | ✅ 已修复 | Zustand authStore.logout() 清除 token + 重定向 |

---

## 三、部署架构

### 3.1 生产 Docker 架构

```
                     ┌──────────────┐
                     │    Nginx     │  ← SSL 终端、静态文件、反向代理、限流
                     │  (443/80)    │     TLS 1.2+ only, HSTS, CSP
                     └──────┬───────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
    ┌─────▼─────┐    ┌─────▼─────┐    ┌──────▼──────┐
    │  Backend   │    │ Frontend  │    │   Celery    │
    │  Gunicorn  │    │ Next.js   │    │   Worker    │
    │  :8000     │    │ :3000     │    │             │
    │ (4 workers)│    │(standalone)│    │             │
    └─────┬─────┘    └───────────┘    └──────┬──────┘
          │                                  │
    ┌─────▼─────┐                     ┌──────▼──────┐
    │PostgreSQL │                     │    Redis    │
    │   :5432   │                     │    :6379    │
    └───────────┘                     └──────┬──────┘
                                             │
                                      ┌──────▼──────┐
                                      │   Flower    │
                                      │   :5555     │
                                      └─────────────┘
```

### 3.2 docker-compose.prod.yml 状态

当前 `docker-compose.prod.yml` 已包含：

| 项目 | 状态 |
|---|---|
| ✅ Nginx | SSL 终端 + 反向代理 (80→443 redirect, HTTP/2, modern ciphers) |
| ✅ media volume | 命名卷 `media` 挂载 |
| ✅ PostgreSQL 健康检查 | `pg_isready` + `service_healthy` 依赖 |
| ✅ Redis 健康检查 | `redis-cli ping` + 密码认证 + `service_healthy` 依赖 |
| ✅ 日志轮转 | 所有服务 `json-file` driver, max-size 10m, max-file 3 |
| ✅ Whisper 模型缓存 | 多阶段 Dockerfile 构建时预下载 base 模型 + WhisperX alignment 模型 |
| ✅ Flower 监控 | Celery 任务监控 (mher/flower:2.0, port 5555) |
| ✅ Gunicorn | 4 workers + UvicornWorker |
| ✅ Frontend standalone | 多阶段 Dockerfile.prod, non-root user, standalone output |
| ✅ Redis 密码认证 | `--requirepass ${REDIS_PASSWORD}` |

### 3.3 多阶段 Docker 构建

**后端 Dockerfile** (`backend/Dockerfile`):

```
Stage 1: builder
  ├── 安装 build 依赖 + 运行时系统库 (ffmpeg, Playwright deps, CJK fonts)
  ├── pip install requirements.txt (阿里云镜像)
  ├── Playwright chromium 安装
  ├── 预下载 faster-whisper base 模型 (~150MB)
  └── 预下载 WhisperX English alignment 模型 (~360MB)

Stage 2: runtime
  ├── 仅安装运行时系统库 (无 build tools)
  ├── COPY Python packages from builder
  ├── COPY Playwright browsers from builder
  ├── COPY Whisper model cache from builder
  └── COPY application code from builder
```

**优势:** 运行时镜像不含 build tools，体积更小，攻击面更小。

**前端 Dockerfile.prod** (`frontend/Dockerfile.prod`):

```
Stage 1: builder
  ├── npm ci
  └── npm run build (standalone output)

Stage 2: runner
  ├── 非 root 用户 (app:app)
  ├── COPY standalone output + static + public
  └── node server.js
```

### 3.4 Nginx 配置要点

当前 `nginx.conf` 配置：

```nginx
# SSL: TLS 1.2+ only, modern ciphers, HSTS
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:...;  # Modern suite
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Rate limiting: 三区分流
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;   # 登录/注册
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;     # 通用 API
limit_req_zone $binary_remote_addr zone=upload:10m rate=10r/m;  # 录音上传

# Proxy cache for media
proxy_cache_path /var/cache/nginx keys_zone=STATIC:10m;
location /media/ { proxy_cache STATIC; proxy_cache_valid 200 1d; }

# HTTP → HTTPS redirect
server { listen 80; return 301 https://$host$request_uri; }
```

---

## 四、测试要求

### 4.1 当前状态

```
后端单元测试:  ✅ pytest (auth, speaking, payments, invite, videos, SR service)
前端 E2E 测试:  ❌ 0 条
CI/CD:          ✅ GitHub Actions (.github/workflows/ci.yml)
```

### 4.2 最小测试集（上线前）

**后端 API 测试（pytest）— 已完成：**

| 测试场景 | 优先级 | 状态 |
|---|---|---|
| 用户注册 → 登录 → JWT | P0 | ✅ test_auth.py |
| 视频提交 → 状态流转 → 字幕返回 | P0 | ✅ test_videos.py |
| 口语评分流程（mock AI） | P0 | ✅ test_speaking.py |
| 兑换码生成 → 兑换 → 防重用 | P0 | ✅ test_invite.py |
| Pro 权益隔离（免费用户调 Pro 接口） | P0 | ✅ test_payments.py |
| 每日次数限制 | P1 | ✅ test_speaking.py |
| 间隔重复算法 | P1 | ✅ test_sr_service.py |

**前端 E2E 测试（Playwright）：**

| 测试场景 | 优先级 |
|---|---|
| 登录 → 仪表盘 → 提交视频链接 | P0 |
| 观看页播放 → 字幕高亮 → 跟读评分 | P0 |
| 兑换码兑换 → 升级 Pro | P1 |
| 移动端字幕面板交互 | P1 |

### 4.3 安装依赖

```bash
# 后端
pip install pytest pytest-asyncio httpx

# 前端
npm install --save-dev @playwright/test
npx playwright install chromium
```

---

## 五、部署步骤

### 5.1 首次部署

```bash
# 1. 服务器初始化
apt update && apt install -y docker.io docker-compose-plugin nginx certbot

# 2. 拉取代码
git clone https://github.com/your-org/speaking.git /opt/speaking
cd /opt/speaking

# 3. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 .env 填入生产环境值（务必设置 JWT_SECRET, DATABASE_URL, OPENAI_API_KEY）

# 4. 启动服务
docker compose -f docker-compose.prod.yml up -d

# 5. 执行数据库迁移
docker exec -it $(docker ps -qf "name=backend") alembic upgrade head

# 6. 配置 SSL
# 将证书放置到 nginx SSL 目录
mkdir -p nginx/ssl
cp /etc/letsencrypt/live/api/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/api/privkey.pem nginx/ssl/
docker compose -f docker-compose.prod.yml restart nginx

# 7. 验证
curl https://api.your-domain.com/health
# 期望: {"status":"ok","timestamp":"...","environment":"production","components":{"database":{"status":"ok"},"redis":{"status":"ok"}}}
```

### 5.2 日常更新

```bash
cd /opt/speaking
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# 如有数据库变更
docker exec -it $(docker ps -qf "name=backend") alembic upgrade head
```

---

## 六、运营支撑

### 6.1 监控接入

| 工具 | 用途 | 状态 |
|---|---|---|
| **Sentry** | 前后端错误追踪 | ✅ 已接入 (`main.py` sentry_sdk.init, 10% traces/profiles) |
| **structlog** | 结构化日志 | ✅ 已配置 — 生产 JSON 格式 (Loki/ELK 兼容)，开发 ConsoleRenderer |
| **健康检查端点** | `/health` 探活 | ✅ 已有 — 检查 DB + Redis，503 on failure |
| **Prometheus** | 指标暴露 | ✅ 已接入 — `prometheus-fastapi-instrumentator`, `/metrics` |
| **Flower** | Celery 任务监控 | ✅ 已配置 — docker-compose.prod.yml, port 5555 |
| **Docker 重启策略** | 崩溃自动恢复 | ✅ 已设为 `unless-stopped` |
| **请求 ID 追踪** | X-Request-ID 中间件 | ✅ 已配置 — HTTP header + Celery task_prerun 绑定 |
| **日志轮转** | Docker json-file | ✅ 所有服务 max-size 10m, max-file 3 |

### 6.2 运营工具（上线后）

| 工具 | 用途 | 优先级 |
|---|---|---|
| 管理后台 | 视频管理、兑换码管理、用户查看 | P1 |
| 数据看板 | 日活、注册量、练习次数、收入 | P2 |
| 结构化日志 | Loki + Grafana 或阿里云日志 | P2 |

### 6.3 首次启动内容准备

上线前需要预先种子一批官方视频，确保首页有内容展示：

```bash
# 通过 seed 脚本种子官方视频
cd backend
python seed_official_videos.py

# 或预览模式（不写入数据库）
python seed_official_videos.py --dry-run
```

建议准备 **10-20 个** 不同难度（A2-C1）和不同话题的精选视频。

---

## 七、资源配置评估

### 7.1 Whisper 资源

| 项目 | 说明 |
|---|---|
| 模型 | faster-whisper base（int8 量化，~150MB 内存）+ WhisperX alignment (~360MB) |
| CPU 转录 | ~1-2 秒/分钟音频（比原版 whisper 快 4x） |
| GPU 转录 | < 0.5 秒/分钟音频（需要 NVIDIA GPU + CUDA） |
| 并发限制 | 单进程单次只能运行一个转录任务 |
| Docker 缓存 | 构建时预下载模型，无需重启时重新下载 |

**建议：**
- **有 GPU** → 使用 `faster-whisper` + CUDA，速度进一步提升
- **无 GPU** → 当前 int8 量化 CPU 模式已足够，或考虑云端语音识别

### 7.2 存储评估

| 项目 | 估算 |
|---|---|
| 视频存储 | 10 分钟 720p ≈ 100MB，100 个视频 ≈ 10GB |
| 数据库 | 1000 用户 + 10000 条练习记录 < 1GB |
| 日志 | 每天 ≈ 100-500MB（轮转后最大 10m × 3 × 6 服务 ≈ 180MB） |

---

## 八、上线检查清单

### 基础设施
- [ ] 服务器已就绪（4C8G+）
- [ ] 域名已备案并配置 DNS
- [ ] SSL 证书已配置（Let's Encrypt 或商业证书）
- [ ] OSS 存储桶已开通并配置 CORS
- [ ] SMTP 服务已配置

### 第三方服务
- [ ] AI API Key 已配置且可用
- [ ] 支付商户已开通（或先使用兑换码模式）
- [ ] YouTube Data API Key 已配置

### 安全
- [x] JWT_SECRET 设置为 64 位强随机字符串 (生产强制非空)
- [x] 兑换码生成接口已限制管理员权限
- [x] 支付回调签名验证已实现 (RSA2 + HMAC-SHA256)
- [x] API 速率限制已配置 (slowapi + nginx)
- [x] 生产环境 DEBUG = False
- [x] CORS 仅允许生产域名
- [x] 安全头已配置 (CSP, HSTS, X-Frame-Options)
- [x] PyJWT 替代 python-jose
- [x] 前端 safe JWT decode + expiry check

### 代码
- [x] 核心 API 已通过测试
- [ ] 注册/登录流程验证通过
- [ ] 视频提交 + 字幕处理流程验证通过
- [ ] 口语评分流程验证通过
- [ ] 兑换码生成 + 兑换流程验证通过
- [ ] Pro/Free 权益隔离验证通过

### 部署
- [ ] 数据库迁移已执行（alembic upgrade head）
- [x] faster-whisper 模型已预下载（Docker 构建时缓存）
- [x] media 目录 volume 挂载已配置
- [x] nginx 反向代理已配置（SSL + 限流 + 缓存）
- [ ] 服务健康检查通过（/health 返回 ok）
- [x] Docker 容器自动重启配置正确 (unless-stopped)
- [x] 日志轮转已配置 (json-file, 10m × 3)
- [x] Flower Celery 监控已配置

### 运营准备
- [ ] 管理员账号已创建
- [ ] 官方精选视频已种子（10-20 个）
- [ ] 兑换码已预生成一批
- [ ] 错误监控已接入 (Sentry)
- [ ] 管理员部署操作文档已就绪

---

## 九、推荐上线节奏

```
Week 1  ████████░░░░░░░░░░░░  服务器 + 域名 + OSS + nginx + Docker 生产环境调通
         ▸ 购买服务器并初始化
         ▸ 配置域名 DNS + SSL
         ▸ 部署 docker-compose.prod.yml 并验证 /health
         ▸ 配置 OSS 存储桶 + CORS

Week 2  ████████████████░░░░  安全加固 + 核心测试
         ▸ 支付回调签名验证（✅ 已实现，需配置真实密钥）
         ▸ API 速率限制（✅ 已实现）
         ▸ 核心流程测试（注册/登录/视频/评分/兑换码）
         ▸ 密码重置功能

Week 3  ████████████████████  Whisper 优化 + 监控 + 种子内容
         ▸ 评估 GPU 方案或云端语音识别
         ▸ 确认 Sentry + Prometheus + Flower 监控正常
         ▸ 种子 10-20 个精选视频
         ▸ 预生成首批兑换码
         ▸ 管理员部署文档

Week 4  ████████████████████  内测 + 修复
         ▸ 邀请 10-20 人内测
         ▸ 修复 bug
         ▸ 正式上线
```

---

## 十、风险管理

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| Whisper 高并发下 CPU 打满 | 中 | 服务不可用 | 任务队列化 + 限制并发数；考虑 GPU 或云端 API |
| YouTube 视频不可用（区域限制/下架） | 中 | 用户无法观看 | 清晰错误提示 + Bilibili/Douyin 多平台支持 |
| AI API 延迟或故障 | 中 | 评分/翻译不可用 | tenacity 重试 + 超时 + 降级提示 |
| 恶意用户刷接口 | 中 | 资源耗尽 + 费用飙升 | slowapi + nginx 限流 + 每日配额 + 费用告警 |
| 支付回调丢失 | 低 | 用户付款后未升级 | 订单状态轮询 + 客服手动处理 |
| 视频版权风险 | 低 | 法律问题 | 仅做学习工具 + 显示来源链接 + DMCA 下架通道 |

---

*最后更新：2026-06-14*

# SeeWord

> 本文档定义 SeeWord 应用的安全态势、威胁模型和响应流程。
>
> 关联文档：[PRODUCTION.md](PRODUCTION.md) · [.agent/system-map.md](../../.agent/system-map.md)（架构现状）· [全站审查报告](../progress/REVIEW-2026-08-14.md)
>
> **本版（2026-08-14）修正**：token key、JWT TTL 分层、Free 权益、JWT blacklist 现状、speaking 引用、redeem_codes 表名、phone 认证、/media 安全措施。

---

## 1. 威胁模型

### 1.1 信任边界

```
┌─────────────────────────────────────────────────────────────────┐
│                        信任边界 1                                │
│                  Internet → Nginx                                │
│  威胁: DDoS、恶意请求、未认证访问                                 │
│  缓解: Nginx 限流(login/api/upload)、HTTPS(HSTS)、CSP/X-Frame-   │
│        Options/nosniff、/media 代理头以 $remote_addr 覆盖 XFF     │
├─────────────────────────────────────────────────────────────────┤
│                        信任边界 2                                │
│                  Nginx → FastAPI                                 │
│  威胁: 请求伪造、JWT 伪造、权限提升                               │
│  缓解: python-jose 签名验证(算法钉死)、角色依赖注入、slowapi 限流 │
│        (Redis 故障时 in-memory 降级)、安全头中间件(/media 除外)    │
├─────────────────────────────────────────────────────────────────┤
│                        信任边界 3                                │
│                  FastAPI → PostgreSQL                            │
│  威胁: SQL 注入、数据泄露                                        │
│  缓解: SQLAlchemy ORM（参数化查询）、最小权限数据库用户              │
├─────────────────────────────────────────────────────────────────┤
│                        信任边界 4                                │
│                  FastAPI → AI API (外部)                         │
│  威胁: API Key 泄露、响应篡改、服务不可用                         │
│  缓解: HTTPS、环境变量存储密钥、tenacity 重试+超时                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 STRIDE 分析

| 威胁类型 | 攻击场景 | 影响 | 当前缓解 | 状态 |
|----------|---------|------|---------|------|
| **Spoofing** | 伪造 JWT token | 冒充任意用户 | HS256 签名验证（算法钉死）+ jti 黑名单 + 改密 iat 失效 | ✅ 已缓解 |
| **Spoofing** | 伪造支付回调 | 免费升级 Pro | RSA2/HMAC-SHA256 签名验证 | ✅ 已缓解 |
| **Spoofing** | 伪造转写回调 | 写任意字幕/置错误 | X-Callback-Secret 常数时间比较 | ✅ 已缓解（共享密钥，需轮换） |
| **Tampering** | 修改请求参数 | 绕过权限检查 | 角色依赖注入 | ✅ 已缓解 |
| **Tampering** | 修改订单金额 | 低价购买 Pro | 服务端金额计算 + PLAN_DEFINITIONS 校验 | ✅ 已缓解 |
| **Repudiation** | 用户否认操作 | 无法追责 | 请求 ID + structlog 结构化日志 | ✅ 已缓解 |
| **Info Disclosure** | API 返回敏感数据 | 用户信息泄露 | 最小返回字段 | ✅ 已缓解 |
| **Info Disclosure** | 未发布视频媒体公开 | 草稿 UGC 泄露 | /media/{video_id}* 发布态门控（official/published/snapshot 公开，owner/admin token 预览） | ✅ 已缓解 |
| **Info Disclosure** | 上传非媒体文件成为可执行内容 | 存储型 XSS → 账户接管 | 上传扩展名服务端白名单 + serve_media 扩展名 allowlist + nosniff | ✅ 已修复 |
| **Info Disclosure** | /media/proxy SSRF | 云元数据/内网探测 | 域名后缀白名单（无 aliyuncs.com）+ 禁重定向 + 限流 | ✅ 已修复 |
| **Denial of Service** | 暴力请求 | 服务不可用 | slowapi 限流 + nginx rate limiting；Redis 故障降级 in-memory | ✅ 已缓解 |
| **Denial of Service** | Redis 故障全 API 500 | 服务不可用 | limiter in-memory fallback（其余 Redis 依赖 fail-open） | ✅ 已修复 |
| **Elevation of Privilege** | 普通用户调用 admin API | 越权操作 | admin 依赖检查（角色读 DB，不读 JWT） | ✅ 已缓解 |

---

## 2. 认证与授权模型

### 2.1 JWT 流程

```
注册/登录 → 后端验证 → 签发 JWT (HS256, python-jose, access 30 分钟)
                                │
                                ▼
客户端 Zustand authStore (单点管理)
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
    localStorage         safe JWT decode       expiry check
    (seeword_token +     (jwt.ts)              (isTokenExpired)
     seeword_refresh_token, 7 天)
                                │
                                ▼
请求头: Authorization: Bearer <token>
                                │
                                ▼
后端 decode_token() (python-jose, 算法钉死) → 提取 user_id → 查询数据库 →
验证用户存在 + jti 黑名单 (Redis, 默认开启) + 改密 iat 失效 + 封禁检查
```

**Token 分层**：access token 30 分钟（`jwt_expire_minutes=30`）；refresh token 7 天（`jwt_refresh_expire_days=7`），仅用于 `/auth/refresh` 换新。前端 `api.ts` 自动刷新（互斥防并发、失败统一登出）。

**前端 JWT 安全改进:**

| 改进 | 实现 | 说明 |
|------|------|------|
| Safe JWT decode | `frontend/src/lib/jwt.ts` | 纯函数解码，base64url 处理，异常安全返回 null |
| Token expiry check | `jwt.ts isTokenExpired()` + `api.ts` 前置检查 | 过期 token 自动触发刷新/登出 |
| 单点 auth 管理 | `stores/authStore.ts` / `adminAuthStore.ts` | Zustand store 统一管理 token/user/isAuthenticated |
| 401 自动刷新 | `lib/createApiClient.ts` | 刷新互斥 + 失败单次登出 |
| 媒体 token | `mediaUrl()` 对 shadowing/草稿媒体追加 `?token=` | `<audio>/<video>` 无法带 Authorization 头；nginx 访问日志不记录 query string |

### 2.2 角色层级

```
Admin (role=admin)
  ├── 可种子官方视频
  ├── 可生成/导出/作废兑换码
  ├── 可预览草稿/未发布视频媒体 (JWT 放行)
  └── 继承 Pro 用户所有权限

Pro (plan=pro, plan_expires_at 到期由 beat 主动降级)
  ├── AI 词汇查询 / 学习建议 / AI 计划生成
  └── 继承 Free 用户所有权限

Free (plan=free)
  ├── 基础视频观看 + 双语字幕
  ├── 词汇本 + SM-2 复习
  ├── 跟读录音（持久化，owner-only 回放，ADR-0013）
  └── 练习/真题（免费档）
```

### 2.3 权限执行点

| 依赖函数 | 位置 | 作用 |
|---------|------|------|
| `get_current_user` | `api/dependencies.py` | 必须登录 (无副作用) |
| `get_optional_user` | `api/dependencies.py` | 可选登录（公开内容浏览） |
| `get_admin_user` | `api/dependencies.py` | 必须为 admin 角色（读 DB 角色，不读 JWT） |
| `require_pro_user` | `api/dependencies.py` | 必须为 Pro 用户 (含过期检查) |
| `require_video_access` / `check_video_access` | `api/dependencies.py` / `services/video_access.py` | 视频访问控制（official/published 公开、owner 私有可见、re-review 看快照） |

---

## 3. 已知漏洞及状态

### ✅ 已修复

| ID | 漏洞 | 修复 | 说明 |
|----|------|------|------|
| VULN-01 | 支付回调无真实签名验证 | RSA2 + HMAC-SHA256 验证 | `_verify_alipay_signature()` 和 `_verify_wechat_signature()` 已实现；开发模式可禁用但日志警告 |
| VULN-02 | CORS 允许 localhost | 环境感知 CORS | 生产模式仅允许 `FRONTEND_URL`，开发模式允许 localhost |
| VULN-03 | API 限流不完整 | slowapi + nginx 分层限流 | slowapi 应用到关键端点；nginx 分 login/api/upload 三区限流；Redis 故障时 in-memory 降级不 500 |
| VULN-04 | JWT 无法即时吊销 | Redis token blacklist **已实现且默认开启**（`jwt_blacklist_enabled=True`） | 登出/改密即黑名单；改密还通过 iat 比较使旧 token 失效 |
| VULN-06 | 视频 URL SSRF | 域名白名单 + 全解析 IP 私网封锁 + DNS-rebinding 双重解析 | `services/video_url_guard.py`，三个提交入口全强制 |
| VULN-09 | 上传文件扩展名来自客户端 | 服务端 content-type→扩展名白名单 + 流式大小校验 | 存储型 XSS 修复（2026-08-14，REVIEW 批次 1） |
| VULN-10 | /media/proxy SSRF | 禁重定向 + 移除 aliyuncs.com 后缀 | 2026-08-14 修复（REVIEW 批次 1） |
| VULN-11 | 草稿/未发布视频媒体公开 | 发布态门控 + owner/admin token 预览 | 2026-08-14 修复（REVIEW 批次 5） |
| VULN-12 | 转写/翻译质量无保障 | 幻觉检测 + 翻译质量门 | fail-fast 于回调/终态 |

### 🟡 中危 / 已知限制

| ID | 漏洞 | 影响 | 位置 | 状态 |
|----|------|------|------|------|
| VULN-05 | 无密码重置流程 | 用户忘记密码无法自助恢复 | — | **待实现** |
| VULN-13 | python-jose 已停止维护（CVE-2024-33663/33664） | 长期未修复的 JWT 库 | `core/security.py` | **迁移 PyJWT 进行中**（PyJWT 已在依赖中；完成前 pip-audit 显式忽略两条 CVE） |
| VULN-14 | 手机号明文 INFO 日志（含 Loki 采集路径） | PIPL 个人数据暴露 | `api/v1/auth.py`、`services/sms_service.py` | **待处理**：日志点脱敏（保留前 3 后 4） |
| VULN-15 | 转写回调共享密钥 + payload 无上限 | 泄露即可写字幕/置 error | `api/v1/internal.py`、`schemas/video.py` | **待处理**：每任务 token + payload 上限 |
| VULN-16 | 匿名 /metrics 与 /health 信息暴露 | 侦察辅助 | `main.py` | **待处理**：内网/鉴权限制 |
| VULN-17 | 限流降级期（Redis 故障）限流失效 | 短窗口滥用 | `core/limiter.py` | **已接受**：与 Redis fail-open 不变量一致，配合 Aliyun 服务端限额 |

### 🟢 低危

| ID | 漏洞 | 影响 | 位置 | 状态 |
|----|------|------|------|------|
| VULN-07 | 跟读录音未加密存储 | 服务器访问可获取录音 | `media/shadowing/` | **可接受** — owner-only JWT 鉴权回放；无加密存储（ADR-0013 记录） |
| VULN-08 | Admin 权限仅前端检查 | 前端 JWT 解码可绕过 UI 限制 | 前端各 admin 页 | **后端有保护** — `get_admin_user` 依赖拦截 |
| VULN-18 | JWT 经 `?token=` 出现在媒体 URL | 日志/Referer 暴露 | `mediaUrl()` | **已缓解** — nginx 访问日志不记录 query string（log_format 用 $uri） |

---

## 4. 安全响应流程

### 4.1 漏洞报告

- **内部发现**: 在项目 issue 中创建安全标签（repo `CandideEgo/Speaking-`）
- **外部报告**: 根目录 `SECURITY.md`（GitHub Security tab 入口）待创建，指向本文档
- **响应 SLA**:
  - 高危: 24 小时内确认，72 小时内修复
  - 中危: 3 个工作日内确认，2 周内修复
  - 低危: 1 周内确认，下个版本修复

### 4.2 披露策略

- 修复后 30 天公开披露细节
- 高危漏洞在修复前不公开

### 4.3 事件响应

1. **发现**: Sentry 告警 / structlog 异常 / 用户报告 / 主动检测
2. **确认**: 复现问题，评估影响范围
3. **遏制**: 临时修复（如禁用受影响端点）
4. **修复**: 开发并部署补丁
5. **复盘**: 记录根因、更新本文档

---

## 5. 数据分类

### 5.1 个人身份信息 (PII)

| 数据 | 存储 | 加密 | 保留策略 |
|------|------|------|---------|
| 手机号 | PostgreSQL `users.phone` | 无（需 HTTPS 传输）；日志待脱敏 | 账户存续期 |
| 密码 | PostgreSQL `users.hashed_password` | bcrypt | 账户存续期 |
| 昵称 | PostgreSQL `users.name` | 无 | 账户存续期 |
| 跟读录音 | 本地文件系统 `media/shadowing/{user_id}/` | 无 | 清理策略待定；owner-only JWT 回放 |

### 5.2 业务数据

| 数据 | 存储 | 保留策略 |
|------|------|---------|
| 跟读记录 | PostgreSQL `shadowing_attempts`（活跃，ADR-0013） | 账户存续期 |
| 口语评分历史 | PostgreSQL `speaking_attempts`（冻结表，ADR-0002） | 账户存续期 |
| 词汇本 | PostgreSQL `vocabulary` | 账户存续期 |
| 订单 | PostgreSQL `orders` | 法定保留期（5 年） |
| 兑换码 | PostgreSQL `redeem_codes` | 使用后 1 年 |

### 5.3 数据保护措施

- **传输加密**: HTTPS（Nginx SSL 终结，TLS 1.2+ only, HSTS preload；prod compose 默认挂载 `nginx.ssl.conf`）
- **存储加密**: 密码 bcrypt 哈希、JWT 签名密钥环境变量
- **访问控制**: 角色依赖注入、数据库最小权限用户、视频访问控制 (`check_video_access`)、媒体发布态门控、shadowing owner-only token
- **日志脱敏**: structlog 不记录密码、token、验证码；**手机号脱敏待落地**；nginx 日志不记录 query string
- **安全头**: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP（nginx server 级 + 后端中间件；/media 由 serve_media 补 nosniff）
- **API 客户端安全**: 前端 `api.ts` 添加 ApiError 类、AbortController 支持、重试逻辑、JWT 过期前置检查

---

## 6. 依赖安全

### 6.1 后端关键依赖

| 依赖 | 用途 | 关注点 |
|------|------|--------|
| python-jose | JWT 签发/验证 | **迁移 PyJWT 进行中**（python-jose 有 CVE 且已不维护） |
| bcrypt | 密码哈希 | 保持版本更新 |
| faster-whisper | 语音识别 | 本地运行，无网络风险 |
| tenacity | 重试 + 超时 | 保护 AI API 调用不无限挂起 |
| slowapi | API 限流 | 保护暴力请求；Redis 故障 in-memory 降级 |
| structlog | 结构化日志 | JSON 格式便于安全审计 |
| prometheus-instrumentator | 指标暴露 | /metrics 未认证（VULN-16 待处理） |

### 6.2 前端关键依赖

| 依赖 | 用途 | 关注点 |
|------|------|--------|
| Next.js | 框架 | SSR 安全配置 |
| React | UI | XSS 防护（默认转义；唯一 dangerouslySetInnerHTML 为静态主题脚本） |
| Zustand | 状态管理 | authStore 单点管理，避免散落 token 操作 |

### 6.3 安全扫描

- **CI 集成（2026-08-14 起）**: `pip-audit`（后端，已知 CVE 显式忽略清单）硬门 + `npm audit --omit=dev`（前端）+ GitHub Dependabot（pip/npm/github-actions 三个 ecosystem）
- **手动检查**: 每月运行一次 `pip-audit -r requirements.txt -r requirements-cloud.txt` 和 `npm audit`，核对忽略清单是否可移除

---

## 7. 密钥管理

### 7.1 环境变量

- **`.env.example`** 不包含任何真实密钥 — 所有值为占位符
- **生产环境** 必须通过 shell 环境或项目根 `.env` 传入真实值（docker compose 只读项目根 .env；`backend/.env` 不会被 compose 读取）
- **`JWT_SECRET`** 生产环境启动时强制非空（`config.py` 校验）
- **支付密钥** (`ALIPAY_PUBLIC_KEY`, `WECHAT_API_V3_KEY`) 仅在签名验证启用时使用
- **`.env*` 与 `youtube_cookies*.txt`** 全部 gitignore；**本地 build 前注意**：backend/.dockerignore 已排除（2026-08-14 补全）

### 7.2 Docker 环境变量传递

- `docker-compose.prod.yml` 从 shell `${VAR}` 传入敏感变量
- 不在 compose 文件中硬编码任何密钥（dev compose 的 seeword_dev 密码仅限开发环境）

---

## 8. 上线前安全检查清单

- [x] VULN-01: 支付回调签名验证已实现 (RSA2 + HMAC-SHA256)
- [x] VULN-02: CORS 环境感知 — 生产仅允许 FRONTEND_URL
- [x] VULN-03: slowapi + nginx 分层限流已配置（Redis 故障降级）
- [x] VULN-04: JWT 黑名单已实现并默认开启
- [ ] VULN-05: 实现密码重置流程
- [x] VULN-06: 视频 URL SSRF 防护（三重校验）
- [x] VULN-09/10/11: 上传 XSS、proxy SSRF、媒体发布态门控（2026-08-14）
- [x] JWT_SECRET 使用强随机字符串 (生产强制非空)
- [x] HTTPS 全站强制 (nginx.ssl.conf HSTS, TLS 1.2+ only；prod compose 默认挂载)
- [x] 安全头（CSP, X-Frame-Options, HSTS, nosniff）— nginx + 后端中间件
- [x] Sentry 不记录 Authorization header (sentry_sdk 默认不收集)
- [x] 依赖安全扫描已配置到 CI（pip-audit + npm audit + dependabot）
- [ ] python-jose → PyJWT 迁移完成（进行中）
- [ ] 手机号日志脱敏（VULN-14）
- [x] 数据库用户最小权限
- [x] 前端 safe JWT decode + expiry check (jwt.ts)
- [x] 前端 401 自动刷新/登出 (api.ts/createApiClient.ts)
- [x] 支付回调始终返回 200
- [x] mock_payment 仅限开发环境

---

*最后更新：2026-08-14（全站审查修正 + 媒体安全修复）*

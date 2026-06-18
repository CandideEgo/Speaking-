# 安全策略 — Speaking

> 本文档定义 Speaking 应用的安全态势、威胁模型和响应流程。
>
> 关联文档：[PRODUCTION.md](PRODUCTION.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 1. 威胁模型

### 1.1 信任边界

```
┌─────────────────────────────────────────────────────────────────┐
│                        信任边界 1                                │
│                  Internet → Nginx                                │
│  威胁: DDoS、恶意请求、未认证访问                                 │
│  缓解: Nginx 限流(login/api/upload)、HTTPS、CORS、HSTS           │
├─────────────────────────────────────────────────────────────────┤
│                        信任边界 2                                │
│                  Nginx → FastAPI                                 │
│  威胁: 请求伪造、JWT 伪造、权限提升                               │
│  缓解: PyJWT 签名验证、角色依赖注入、slowapi 限流、安全头中间件    │
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
| **Spoofing** | 伪造 JWT token | 冒充任意用户 | PyJWT HS256 签名验证 | ✅ 已缓解 |
| **Spoofing** | 伪造支付回调 | 免费升级 Pro | RSA2/HMAC-SHA256 签名验证 | ✅ 已缓解 |
| **Tampering** | 修改请求参数 | 绕过权限检查 | 角色依赖注入 | ✅ 已缓解 |
| **Tampering** | 修改订单金额 | 低价购买 Pro | 服务端金额计算 + PLAN_DEFINITIONS 校验 | ✅ 已缓解 |
| **Repudiation** | 用户否认操作 | 无法追责 | 请求 ID + structlog 结构化日志 | ✅ 已缓解 |
| **Info Disclosure** | API 返回敏感数据 | 用户信息泄露 | 最小返回字段 | ✅ 已缓解 |
| **Info Disclosure** | 数据库泄露 | 全量数据泄露 | bcrypt 密码哈希 | 🟡 部分 |
| **Denial of Service** | 暴力请求 | 服务不可用 | slowapi 限流 + nginx rate limiting | ✅ 已缓解 |
| **Elevation of Privilege** | 普通用户调用 admin API | 越权操作 | admin 依赖检查 | ✅ 已缓解 |

---

## 2. 认证与授权模型

### 2.1 JWT 流程

```
注册/登录 → 后端验证 → 签发 JWT (HS256, PyJWT, 7天有效期)
                               │
                               ▼
客户端 Zustand authStore (单点管理)
                               │
               ┌───────────────┼───────────────┐
               │               │               │
               ▼               ▼               ▼
   localStorage         safe JWT decode       expiry check
   (speaking_token)      (jwt.ts)             (isTokenExpired)
                               │
                               ▼
请求头: Authorization: Bearer <token>
                               │
                               ▼
后端 decode_token() (PyJWT) → 提取 user_id → 查询数据库 → 验证用户存在
```

**前端 JWT 安全改进:**

| 改进 | 实现 | 说明 |
|------|------|------|
| Safe JWT decode | `frontend/src/lib/jwt.ts` | 纯函数解码，base64url 处理，异常安全返回 null |
| Token expiry check | `jwt.ts isTokenExpired()` + `api.ts` 前置检查 | 过期 token 自动触发 logout |
| 单点 auth 管理 | `stores/authStore.ts` | Zustand store 统一管理 token/user/isAuthenticated，消除散落的 localStorage 访问 |
| 401 自动 logout | `api.ts` | 收到 401 立即清除状态并重定向 |

### 2.2 角色层级

```
Admin (role=admin)
  ├── 可种子官方视频
  ├── 可生成/导出兑换码
  └── 继承 Pro 用户所有权限

Pro (plan=pro)
  ├── AI 词汇查询
  ├── AI 学习建议
  ├── AI 每日总结
  └── 继承 Free 用户所有权限

Free (plan=free)
  ├── 基础视频观看
  ├── 口语练习 (3次/天)
  ├── 词汇本
  └── 浏览/社区内容
```

### 2.3 权限执行点

| 依赖函数 | 位置 | 作用 |
|---------|------|------|
| `get_current_user` | `api/dependencies.py` | 必须登录 (无副作用) |
| `get_optional_user` | `api/dependencies.py` | 可选登录（公开内容浏览） |
| `get_admin_user` | `api/dependencies.py` | 必须为 admin 角色 |
| `require_pro_user` | `api/dependencies.py` | 必须为 Pro 用户 (含过期检查) |
| `require_video_access` | `api/dependencies.py` | 视频访问控制 (官方视频公开, 用户视频仅本人) |

---

## 3. 已知漏洞及状态

### ✅ 已修复

| ID | 漏洞 | 修复 | 说明 |
|----|------|------|------|
| VULN-01 | 支付回调无真实签名验证 | RSA2 + HMAC-SHA256 验证 | `_verify_alipay_signature()` 和 `_verify_wechat_signature()` 已实现；开发模式可禁用但日志警告 |
| VULN-02 | CORS 允许 localhost | 环境感知 CORS | 生产模式仅允许 `FRONTEND_URL`，开发模式允许 localhost |
| VULN-03 | API 限流不完整 | slowapi + nginx 分层限流 | slowapi 应用到关键端点 (create-order 5/min, callback 30/min)；nginx 分 login/api/upload 三区限流 |

### 🟡 中危

| ID | 漏洞 | 影响 | 位置 | 状态 |
|----|------|------|------|------|
| VULN-04 | JWT 无法即时吊销 | Token 泄露后 7 天风险窗口 | 认证系统 | **已知限制** — 可引入 Redis token blacklist |
| VULN-05 | 无密码重置流程 | 用户忘记密码无法自助恢复 | — | **待实现** |

### 🟢 低危

| ID | 漏洞 | 影响 | 位置 | 状态 |
|----|------|------|------|------|
| VULN-07 | 音频临时文件未加密 | 服务器访问可获取录音 | `speaking_service.py` | **可接受** |
| VULN-08 | Admin 权限仅前端检查 | 前端 JWT 解码可绕过 UI 限制 | `admin/page.tsx` | **后端有保护** — `get_admin_user` 依赖拦截 |

---

## 4. 安全响应流程

### 4.1 漏洞报告

- **内部发现**: 在项目 issue 中创建安全标签
- **外部报告**: 提供 security@ 邮箱（上线前配置）
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
| 箱 | PostgreSQL `users.email` | 无（需 HTTPS 传输） | 账户存续期 |
| 密码 | PostgreSQL `users.hashed_password` | bcrypt | 账户存续期 |
| 昵称 | PostgreSQL `users.name` | 无 | 账户存续期 |
| 录音 | 本地文件系统 `media/` | 无 | 清理策略待定 |

### 5.2 业务数据

| 数据 | 存储 | 保留策略 |
|------|------|---------|
| 口语练习记录 | PostgreSQL `speaking_attempts` | 账户存续期 |
| 词汇本 | PostgreSQL `vocabulary` | 账户存续期 |
| 订单 | PostgreSQL `orders` | 法定保留期（5 年） |
| 兑换码 | PostgreSQL `invite_codes` | 使用后 1 年 |

### 5.3 数据保护措施

- **传输加密**: HTTPS（Nginx SSL 终结，TLS 1.2+ only, HSTS preload）
- **存储加密**: 密码 bcrypt 哈希、JWT 签名密钥环境变量、PyJWT 替代 python-jose
- **访问控制**: 角色依赖注入、数据库最小权限用户、视频访问控制 (`require_video_access`)
- **日志脱敏**: structlog 不记录密码、token、音频数据；Celery task_prerun 绑定 request_id
- **安全头**: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP (生产模式)
- **API 客户端安全**: 前端 `api.ts` 添加 ApiError 类、AbortController 支持、重试逻辑、JWT 过期前置检查

---

## 6. 依赖安全

### 6.1 后端关键依赖

| 依赖 | 用途 | 关注点 |
|------|------|--------|
| PyJWT | JWT 签发/验证 | 替代 python-jose (已移除)，无 RSA 相关 CVE |
| bcrypt | 密码哈希 | 保持版本更新 |
| faster-whisper | 语音识别 | 本地运行，无网络风险 |
| tenacity | 重试 + 超时 | 保护 OpenAI API 调用不无限挂起 |
| slowapi | API 限流 | 保护暴力请求 |
| structlog | 结构化日志 | JSON 格式便于安全审计 |
| prometheus-instrumentator | 指标暴露 | 仅暴露 /metrics，不泄露业务数据 |

### 6.2 前端关键依赖

| 依赖 | 用途 | 关注点 |
|------|------|--------|
| Next.js | 框架 | SSR 安全配置 |
| React | UI | XSS 防护（默认转义） |
| Zustand | 状态管理 | authStore 单点管理，避免散落 token 操作 |

### 6.3 安全扫描

- **CI 集成**: 当前未配置依赖扫描
- **建议**: 添加 `pip-audit`（后端）和 `npm audit`（前端）到 CI 流水线
- **手动检查**: 每月运行一次 `pip-audit -r requirements.txt` 和 `npm audit`

---

## 7. 密钥管理

### 7.1 环境变量

- **`.env.example`** 不包含任何真实密钥 — 所有值为占位符 (`your-jwt-secret-here`, `your-api-key-here`)
- **生产环境** 必须通过 shell 环境或专用 `.env` 传入真实值
- **`JWT_SECRET`** 生产环境启动时强制非空 (`config.py model_post_init` RuntimeError)
- **支付密钥** (`ALIPAY_PUBLIC_KEY`, `WECHAT_API_V3_KEY`) 仅在签名验证启用时使用

### 7.2 Docker 环境变量传递

- `docker-compose.prod.yml` 从 shell `${VAR}` 传入敏感变量
- 不在 compose 文件中硬编码任何密钥

---

## 8. 上线前安全检查清单

- [x] VULN-01: 支付回调签名验证已实现 (RSA2 + HMAC-SHA256)
- [x] VULN-02: CORS 环境感知 — 生产仅允许 FRONTEND_URL
- [x] VULN-03: slowapi + nginx 分层限流已配置
- [ ] VULN-05: 实现密码重置流程
- [x] JWT_SECRET 使用强随机字符串 (生产强制非空)
- [x] `ENV=production` 强制 JWT_SECRET 非空
- [x] HTTPS 全站强制 (nginx HSTS, TLS 1.2+ only)
- [x] 安全头中间件 (CSP, X-Frame-Options, HSTS, etc.)
- [x] Sentry 不记录 Authorization header (sentry_sdk 默认不收集)
- [ ] 配置依赖安全扫描到 CI
- [x] 数据库用户最小权限
- [x] PyJWT 替代 python-jose (消除 RSA CVE 风险)
- [x] 前端 safe JWT decode + expiry check (jwt.ts)
- [x] 前端 401 自动 logout (api.ts)
- [x] 支付回调始终返回 200 (alipay callback 返回 JSON; wechat callback 返回 SUCCESS/FAIL)
- [x] mock_payment 仅限开发环境 (mock_payments router 仅 env=development/testing 注册)

---

*最后更新：2026-06-14*

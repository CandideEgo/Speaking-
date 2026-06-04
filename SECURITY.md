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
│  缓解: Nginx 限流、HTTPS、CORS                                   │
├─────────────────────────────────────────────────────────────────┤
│                        信任边界 2                                │
│                  Nginx → FastAPI                                 │
│  威胁: 请求伪造、JWT 伪造、权限提升                               │
│  缓解: JWT 签名验证、角色检查、rate limiting                      │
├─────────────────────────────────────────────────────────────────┤
│                        信任边界 3                                │
│                  FastAPI → PostgreSQL                            │
│  威胁: SQL 注入、数据泄露                                        │
│  缓解: SQLAlchemy ORM（参数化查询）、最小权限数据库用户              │
├─────────────────────────────────────────────────────────────────┤
│                        信任边界 4                                │
│                  FastAPI → AI API (外部)                         │
│  威胁: API Key 泄露、响应篡改、服务不可用                         │
│  缓解: HTTPS、环境变量存储密钥、JSON 提取容错                      │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 STRIDE 分析

| 威胁类型 | 攻击场景 | 影响 | 当前缓解 | 状态 |
|----------|---------|------|---------|------|
| **Spoofing** | 伪造 JWT token | 冒充任意用户 | HS256 签名验证 | ✅ 已缓解 |
| **Spoofing** | 伪造支付回调 | 免费升级 Pro | 签名验证（占位） | 🔴 **未缓解** |
| **Tampering** | 修改请求参数 | 绕过权限检查 | 角色依赖注入 | ✅ 已缓解 |
| **Tampering** | 修改订单金额 | 低价购买 Pro | 服务端金额计算 | ✅ 已缓解 |
| **Repudiation** | 用户否认操作 | 无法追责 | 请求 ID + 结构化日志 | 🟡 部分 |
| **Info Disclosure** | API 返回敏感数据 | 用户信息泄露 | 最小返回字段 | ✅ 已缓解 |
| **Info Disclosure** | 数据库泄露 | 全量数据泄露 | bcrypt 密码哈希 | 🟡 部分 |
| **Denial of Service** | 暴力请求 | 服务不可用 | slowapi 限流 | 🟡 部分端点 |
| **Elevation of Privilege** | 普通用户调用 admin API | 越权操作 | admin 依赖检查 | ✅ 已缓解 |

---

## 2. 认证与授权模型

### 2.1 JWT 流程

```
注册/登录 → 后端验证 → 签发 JWT (HS256, 7天有效期)
                               │
                               ▼
客户端 localStorage (key: speaking_token)
                               │
                               ▼
请求头: Authorization: Bearer <token>
                               │
                               ▼
后端 decode_token() → 提取 user_id → 查询数据库 → 验证用户存在
```

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
| `get_current_user` | `api/dependencies.py` | 必须登录 |
| `get_optional_user` | `api/dependencies.py` | 可选登录（公开内容浏览） |
| `get_admin_user` | `api/dependencies.py` | 必须为 admin 角色 |
| `require_pro_user` | `api/dependencies.py` | 必须为 Pro 用户 |

---

## 3. 已知漏洞及状态

### 🔴 高危

| ID | 漏洞 | 影响 | 位置 | 状态 |
|----|------|------|------|------|
| VULN-01 | 支付回调无真实签名验证 | 任何人可伪造回调升级 Pro | `payments.py` | **待修复** |
| VULN-02 | CORS 允许 localhost | 生产环境应限制为实际域名 | `main.py:64-69` | **待修复** |

### 🟡 中危

| ID | 漏洞 | 影响 | 位置 | 状态 |
|----|------|------|------|------|
| VULN-03 | API 限流不完整 | 部分端点可被滥用 | 全局 | **待修复** |
| VULN-04 | JWT 无法即时吊销 | Token 泄露后 7 天风险窗口 | 认证系统 | **已知限制** |
| VULN-05 | 无密码重置流程 | 用户忘记密码无法自助恢复 | — | **待实现** |
| VULN-06 | Sentry traces_sample_rate=0.1 | 可能记录敏感请求内容 | `main.py:23` | **需评估** |

### 🟢 低危

| ID | 漏洞 | 影响 | 位置 | 状态 |
|----|------|------|------|------|
| VULN-07 | 音频临时文件未加密 | 服务器访问可获取录音 | `speaking_service.py:35` | **可接受** |
| VULN-08 | Admin 权限仅前端检查 | 前端 JWT 解码可绕过 UI 限制 | `admin/page.tsx` | **后端有保护** |

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

1. **发现**: Sentry 告警 / 用户报告 / 主动检测
2. **确认**: 复现问题，评估影响范围
3. **遏制**: 临时修复（如禁用受影响端点）
4. **修复**: 开发并部署补丁
5. **复盘**: 记录根因、更新本文档

---

## 5. 数据分类

### 5.1 个人身份信息 (PII)

| 数据 | 存储 | 加密 | 保留策略 |
|------|------|------|---------|
| 邮箱 | PostgreSQL `users.email` | 无（需 HTTPS 传输） | 账户存续期 |
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

- **传输加密**: HTTPS（Nginx SSL 终结）
- **存储加密**: 密码 bcrypt 哈希、JWT 签名密钥环境变量
- **访问控制**: 角色依赖注入、数据库最小权限用户
- **日志脱敏**: 不记录密码、token、音频数据

---

## 6. 依赖安全

### 6.1 后端关键依赖

| 依赖 | 用途 | 关注点 |
|------|------|--------|
| python-jose | JWT | RSA 相关 CVE |
| bcrypt | 密码哈希 | 保持版本更新 |
| faster-whisper | 语音识别 | 本地运行，无网络风险 |
| openai (SDK) | AI API | 密钥管理 |

### 6.2 前端关键依赖

| 依赖 | 用途 | 关注点 |
|------|------|--------|
| Next.js | 框架 | SSR 安全配置 |
| React | UI | XSS 防护（默认转义） |

### 6.3 安全扫描

- **CI 集成**: 当前未配置依赖扫描
- **建议**: 添加 `pip-audit`（后端）和 `npm audit`（前端）到 CI 流水线
- **手动检查**: 每月运行一次 `pip-audit -r requirements.txt` 和 `npm audit`

---

## 7. 上线前安全检查清单

- [ ] VULN-01: 实现支付回调真实签名验证
- [ ] VULN-02: CORS `allow_origins` 改为生产域名
- [ ] VULN-03: 所有端点配置 rate limiting
- [ ] VULN-05: 实现密码重置流程
- [ ] JWT_SECRET 使用 64 位强随机字符串
- [ ] `ENV=production` 强制 JWT_SECRET 非空
- [ ] HTTPS 全站强制
- [ ] Sentry 不记录敏感 header（Authorization）
- [ ] 配置依赖安全扫描到 CI
- [ ] 数据库用户最小权限（非 superuser）

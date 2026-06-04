# API 参考文档

## 1. 概述

Speaking 后端基于 FastAPI 构建，所有 API 端点挂载在 `/api/v1` 前缀下。FastAPI 自动生成交互式文档：

- **Swagger UI**: `GET /docs`
- **ReDoc**: `GET /redoc`
- **OpenAPI JSON**: `GET /openapi.json`

本文档侧重于约定、非显而易见的模式和跨端点通用行为，不逐字段重复 OpenAPI schema 的内容。

---

## 2. 认证

采用 JWT Bearer Token 认证方案。

**获取 Token：**

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "secret" }
```

响应：

```json
{ "token": "eyJ...", "user": { "id": "...", "email": "...", "name": "...", ... } }
```

**使用 Token：**

在后续请求的 `Authorization` 头中携带 Bearer Token：

```http
GET /api/v1/users/me
Authorization: Bearer eyJ...
```

**认证依赖层级：**

| 依赖函数 | 行为 |
|---------|------|
| `get_current_user` | 必须提供有效 Token，否则 401 |
| `get_optional_user` | Token 存在时解析用户，不存在时返回 `None`（用于公开/私有混合端点） |
| `get_admin_user` | 在 `get_current_user` 基础上要求 `role == admin`，否则 403 |
| `require_pro_user` | 在 `get_current_user` 基础上要求 `plan == pro`，否则 403 |

---

## 3. 错误响应

所有错误响应统一格式：

```json
{ "detail": "描述信息" }
```

**HTTP 状态码约定：**

| 状态码 | 含义 | 典型场景 |
|-------|------|---------|
| 400 | Bad Request | 参数非法、业务逻辑前置校验失败 |
| 401 | Unauthorized | 未提供 Token、Token 无效、Token 过期 |
| 403 | Forbidden | 权限不足（非管理员访问管理端点、免费用户超限） |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 邮箱已注册等唯一约束冲突 |
| 413 | Payload Too Large | 音频文件超过 5MB 上限 |
| 422 | Unprocessable Entity | 请求体 schema 校验失败（FastAPI 自动返回） |
| 429 | Too Many Requests | 超出速率限制 |
| 500 | Internal Server Error | 服务端未捕获异常 |

422 响应由 FastAPI/Pydantic 自动生成，格式包含 `detail` 数组，列出每个校验失败字段：

```json
{
  "detail": [
    { "loc": ["body", "email"], "msg": "value is not a valid email", "type": "value_error.email" }
  ]
}
```

---

## 4. 分页

部分列表端点支持分页参数，采用 `page` + `page_size` 风格：

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| `page` | int | 1 | 页码（从 1 开始） |
| `page_size` / `limit` | int | 20 或 50 | 每页条数 |

**分页响应格式：**

```json
{
  "items": [...],
  "page": 1,
  "has_more": true
}
```

`has_more` 为 `true` 表示还有更多数据可加载（基于当前 `page_size` 是否返回了满页数据判断）。

**使用分页的端点：**

- `GET /api/v1/browse/feed` — `page` + `page_size`
- `GET /api/v1/community/feed` — `page` + `page_size`
- `GET /api/v1/invite-codes` — `offset` + `limit`

**注意：** 部分列表端点（如 `GET /api/v1/videos`、`GET /api/v1/vocabulary`）使用 `limit` 参数但无 offset/page，返回最近 N 条记录。

---

## 5. 文件上传

口语练习提交使用 `multipart/form-data`：

```http
POST /api/v1/speaking/practice
Authorization: Bearer eyJ...
Content-Type: multipart/form-data

audio:        <binary>      (必填，音频文件)
subtitle_id:  <string>      (必填，字幕 ID)
```

**音频约束：**

| 约束 | 值 |
|-----|---|
| 最大文件大小 | 5 MB |
| 允许的 MIME 类型 | `audio/webm`, `audio/wav`, `audio/mp3`, `audio/mpeg`, `audio/ogg` |
| 允许的文件扩展名 | `.webm`, `.wav`, `.mp3`, `.ogg` |

上传时同时校验 Content-Type 和文件扩展名，任一不匹配返回 400。

---

## 6. 限流

使用 [SlowAPI](https://github.com/laurentS/slowapi) 实现基于 IP 的速率限制。全局默认限制 `200/minute`（生产环境），测试环境下所有限流装饰器不生效。

**端点级限流：**

| 端点 | 限制 | 说明 |
|-----|------|------|
| `POST /api/v1/auth/register` | 3/minute | 防止批量注册 |
| `POST /api/v1/auth/login` | 5/minute | 防止暴力破解 |
| `POST /api/v1/speaking/practice` | 10/minute | 控制转录/AI 调用频率 |
| `POST /api/v1/ai/word-lookup` | 20/minute | AI 词汇查询 |
| `GET /api/v1/ai/assistant/summary` | 10/minute | AI 日报生成 |
| `GET /api/v1/ai/assistant/recommend` | 10/minute | AI 推荐生成 |

超限时返回 429：

```json
{ "detail": "Too many requests. Please try again later." }
```

**免费用户额外限制：** 口语练习每天最多 3 次（业务层校验，非速率限制），超出返回 403。

---

## 7. API 端点一览

共 11 个路由模块，38 个端点。认证列标注：**Public** = 无需认证，**Auth** = 需要 Bearer Token，**Admin** = 需要管理员，**Pro** = 需要 Pro 订阅。

### auth（`/api/v1/auth`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/register` | Public | 注册新用户，返回 JWT Token |
| POST | `/login` | Public | 邮箱密码登录，返回 JWT Token |

### users（`/api/v1/users`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/me` | Auth | 获取当前用户信息 |
| PATCH | `/me` | Auth | 更新当前用户资料（name、level） |

### videos（`/api/v1/videos`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `` | Auth | 提交视频 URL，触发后台处理 |
| GET | `/public` | Public | 获取官方公开视频列表 |
| GET | `/{video_id}` | Optional | 获取视频详情含字幕（官方公开，私有需拥有者） |
| GET | `/{video_id}/status` | Public | 查询视频处理状态 |
| GET | `/{video_id}/quiz` | Public | 获取视频测验题目 |
| POST | `/{video_id}/quiz/submit` | Auth | 提交测验成绩 |
| GET | `` | Auth | 获取当前用户的视频列表 |
| POST | `/seed` | Admin | 添加官方视频（管理后台用） |

### speaking（`/api/v1/speaking`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/practice` | Auth | 提交口语练习音频，AI 评分 |
| GET | `/attempts` | Auth | 获取用户口语练习记录（最近 50 条） |
| GET | `/stats` | Auth | 获取用户口语练习统计 |

### ai（`/api/v1/ai`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/word-lookup` | Pro | AI 语境词汇释义 |
| GET | `/assistant/summary` | Pro | AI 每日学习摘要 |
| GET | `/assistant/recommend` | Pro | AI 学习推荐 |

### payments（`/api/v1/payments`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/create-order` | Auth | 创建支付订单 |
| GET | `/mock-pay` | Auth | 模拟支付（开发环境） |
| POST | `/callback/alipay` | Public | 支付宝回调通知 |
| POST | `/callback/wechat` | Public | 微信支付回调通知 |
| GET | `/status` | Auth | 查询当前用户订阅状态 |

### invite-codes（`/api/v1/invite-codes`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/generate` | Admin | 批量生成邀请码 |
| GET | `/export` | Admin | 导出未使用邀请码（CSV） |
| GET | `` | Admin | 分页查询邀请码列表 |
| POST | `/redeem` | Auth | 兑换邀请码升级 Pro |

### vocabulary（`/api/v1/vocabulary`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `` | Auth | 添加单词到生词本 |
| GET | `` | Auth | 查询生词列表（可筛选待复习） |
| POST | `/{word_id}/review` | Auth | SM-2 间隔重复复习记录 |
| DELETE | `/{word_id}` | Auth | 删除生词 |

### youtube（`/api/v1/youtube`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/search` | Public | 通过 yt-dlp 搜索 YouTube 视频 |

### browse（`/api/v1/browse`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/categories` | Public | 获取内容分类列表 |
| GET | `/feed` | Public | 分页浏览内容流（按分类和级别筛选） |

### community（`/api/v1/community`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/categories` | Public | 获取社区分类列表 |
| GET | `/feed` | Public | 分页浏览社区内容流 |

### rubrics（`/api/v1/rubrics`）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `` | Public | 获取所有口语评分标准 |
| GET | `/default` | Public | 获取默认评分标准 |

> **注意：** rubrics 路由文件存在但尚未在 `app/main.py` 中注册，需添加 `app.include_router(rubrics.router, prefix="/api/v1")` 后方可访问。

### 健康检查

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/health` | Public | 服务健康检查，返回 `{"status": "ok"}` |

---

## 8. CI 自动生成

建议在 CI 流水线中添加步骤，自动导出 OpenAPI schema 以供前端或文档站点使用：

```bash
cd backend && python -c "from app.main import app; import json; print(json.dumps(app.openapi()))" > openapi.json
```

可将此步骤加入 `.github/workflows/ci.yml`，确保每次代码变更后 OpenAPI 规范保持同步。

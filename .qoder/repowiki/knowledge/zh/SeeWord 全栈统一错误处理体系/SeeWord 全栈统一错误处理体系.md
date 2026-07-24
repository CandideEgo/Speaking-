---
kind: error_handling
name: SeeWord 全栈统一错误处理体系
category: error_handling
scope:
    - '**'
source_files:
    - backend/app/core/errors.py
    - backend/app/main.py
    - frontend/src/lib/createApiClient.ts
    - frontend/src/lib/api.ts
    - frontend/src/lib/errors.ts
    - frontend/src/app/error.tsx
    - frontend/src/app/(main)/error.tsx
---

## 后端（FastAPI）：集中式异常处理器 + 统一 envelope

### 核心机制
- **`app/core/errors.py`** 定义 `ErrorCode` 常量类与 `AppError` 业务异常基类，所有业务错误通过 `raise AppError(status_code, ErrorCode.XXX, "message", detail?)` 抛出。
- **`backend/app/main.py`** 在 `create_app()` 中注册全局异常处理器：
  - `_app_exception_handler`：将 `AppError` 转为 `{code, message, detail?}` 统一 envelope
  - `_http_exception_handler`：兜底 FastAPI 的 `HTTPException`，自动映射为 `HTTP_{status}` code
  - `_validation_exception_handler`：Pydantic 422 校验错误 → `VALIDATION_ERROR` + 人类可读 message
  - `_rate_limit_handler`：slowapi 限流 → `RATE_LIMITED`
  - `_ai_service_error_handler`：`AIServiceError` → 502 + `AI_SERVICE_UNAVAILABLE`

### 错误码分类
鉴权（UNAUTHORIZED/INVALID_CREDENTIALS/TOKEN_EXPIRED/FORBIDDEN）、资源（NOT_FOUND/CONFLICT）、限流（RATE_LIMITED）、校验（VALIDATION_ERROR）、AI（AI_SERVICE_UNAVAILABLE）、支付/兑换（PAYMENTS_DISABLED/INVALID_REDEEM_CODE）、配额（QUOTA_EXCEEDED）、兜底（INTERNAL_ERROR）。

### 中间件与日志
- Request ID 中间件：每个请求注入 `X-Request-ID`，贯穿日志与错误追踪
- 请求日志中间件：记录 method/path/status/request_id
- Sentry 集成：生产环境自动上报未捕获异常

## 前端（Next.js）：分层错误处理

### API 客户端层（`src/lib/createApiClient.ts`）
- `ApiClientError` 基类携带 `status`、`code`、`response` 字段
- 自动重试：5xx 错误最多重试 2 次（1s、2s 退避），支持 AbortSignal 取消
- 401 自动刷新 token：失败则调用 `onSessionExpired()` 登出
- 解析后端 envelope：优先 `data.message`，回退 `detail`（兼容 422 数组格式）

### 业务封装层（`src/lib/api.ts`）
- `ApiError extends ApiClientError`，统一命名
- `apiErrorMessage(err, fallback)` / `toastApiError(err, fallback)` 工具函数，提供一致的 toast 提示

### 页面级错误（Next.js App Router）
- `src/app/error.tsx` 与 `src/app/(main)/error.tsx`：使用 `ErrorState` 组件展示「出错了」页面，带重试按钮
- `not-found.tsx`：404 页面

## 跨端约定
- 后端统一返回 `{code, message, detail?}` envelope
- 前端 `ApiClientError.code` 直接映射后端 `ErrorCode`，用于精准 UI 分支（如 401 跳转登录、429 显示冷却倒计时）
- 用户可见消息一律走 `message` 字段，原始细节走 `detail` 字段供调试

## 开发者规范
1. 业务异常统一用 `raise AppError(状态码, ErrorCode.XXX, "人类可读消息")`，禁止裸抛 `HTTPException`（存量代码逐步迁移）
2. 第三方服务异常封装为领域异常（如 `AIServiceError`），由全局 handler 转标准 envelope
3. 前端统一通过 `api()` 调用，错误通过 `toastApiError` 或 `setError(apiErrorMessage(...))` 处理
4. 新增错误码先在 `ErrorCode` 中声明，再在对应模块使用

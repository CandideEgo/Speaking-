---
kind: logging_system
name: 后端结构化日志系统（structlog + JSON 输出）
category: logging_system
scope:
    - '**'
source_files:
    - backend/app/core/logging.py
    - backend/app/main.py
    - backend/app/core/config.py
---

SeeWord 后端采用 **structlog** 作为统一日志框架，通过 `app/core/logging.py` 集中配置，实现开发环境与生产环境的不同输出格式，并自动为 Celery 任务注入 `request_id` 上下文变量。

### 1. 使用的框架与工具
- **structlog**：结构化日志库，支持键值对字段、上下文变量绑定、多渲染器切换。
- **标准库 logging**：仅用于设置根 logger 级别，供第三方库遵循统一的日志级别。
- **Sentry**：在 production 环境下通过 DSN 初始化错误追踪，与 structlog 并存。
- **Prometheus Instrumentator**：HTTP 指标暴露，与日志系统互补但不耦合。

### 2. 核心文件与包
- `backend/app/core/logging.py`：日志配置中心，提供 `configure_logging()` 和 `get_logger()`。
- `backend/app/main.py`：应用启动时调用 `configure_logging()`，并通过中间件记录请求日志。
- `backend/app/core/config.py`：`Settings.log_level` 控制日志级别（默认 INFO），`env` 决定输出格式。

### 3. 架构与设计决策
- **双渲染器策略**：production 使用 `JSONRenderer` 输出机器可读的 JSON 日志（便于 Loki/ELK 解析），development 使用 `ConsoleRenderer(colors=True)` 输出彩色人类可读日志。
- **上下文变量传播**：通过 `structlog.contextvars.merge_contextvars` 处理器，结合 FastAPI 中间件的 `X-Request-ID` 头和 Celery 的 `task_prerun` 信号，自动将 `request_id` 注入每条日志。
- **统一入口**：所有模块通过 `from app.core.logging import get_logger` 获取 logger，避免直接依赖 structlog 或 stdlib logging。
- **日志级别**：由 `settings.log_level` 控制（DEBUG/INFO/WARNING/ERROR/CRITICAL），根 logger 级别同步设置以影响第三方库。

### 4. 开发者规范
- **创建 logger**：使用 `logger = get_logger(__name__)`，不要直接使用 `structlog.get_logger()` 或 `logging.getLogger()`。
- **结构化字段**：日志消息应包含有意义的键值对，如 `logger.info("sms_code_sent", phone=data.phone, purpose=data.purpose)`，便于按字段过滤和聚合。
- **异常信息**：使用 `exc_info=True` 参数记录堆栈跟踪，如 `logger.warning("cache_get_error", key=key, exc_info=True)`。
- **禁止裸 print**：业务代码中不得使用 `print()` 或 `logging.debug/info/warning/error` 直接输出，必须通过 `get_logger()`。
- **Celery 任务**：无需手动绑定 request_id，`task_prerun` 信号已自动处理；任务内日志会继承该上下文。
- **敏感信息**：避免在日志中记录密码、token、完整手机号等敏感数据，必要时进行脱敏。

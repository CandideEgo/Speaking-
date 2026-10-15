"""统一错误处理 - 错误码 + AppError + 全局 envelope。

后端所有错误响应经 main.py 全局 handler 转为统一 envelope:

    {"code": "<ErrorCode>", "message": "<人类可读>", "detail": <可选原始 detail>}

- AppError: 业务代码显式抛出，带 code + message (+ optional detail)。
- HTTPException: 存量 150 处，全局 handler 兜底转 envelope，code = HTTP_{status}。
- RequestValidationError (422): code = VALIDATION_ERROR, detail = pydantic errors 数组。

前端 ApiClientError.code / .message 落地可用（之前 code 永远 null、message 从 detail 解析）。
"""

import math
from typing import Any


class ErrorCode:
    """机器可读错误码（字符串常量，前端按 code 精准映射中文/分支）。"""

    # 鉴权
    UNAUTHORIZED = "UNAUTHORIZED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    FORBIDDEN = "FORBIDDEN"

    # 资源
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"

    # 限流
    RATE_LIMITED = "RATE_LIMITED"

    # 校验
    VALIDATION_ERROR = "VALIDATION_ERROR"
    BAD_REQUEST = "BAD_REQUEST"

    # AI
    AI_SERVICE_UNAVAILABLE = "AI_SERVICE_UNAVAILABLE"

    # 支付/兑换
    PAYMENTS_DISABLED = "PAYMENTS_DISABLED"
    INVALID_REDEEM_CODE = "INVALID_REDEEM_CODE"

    # 配额
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"

    # 非 AI 的下游依赖不可用（GPU worker 掉线、引擎未配置等）
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"

    # 兜底
    INTERNAL_ERROR = "INTERNAL_ERROR"


class AppError(Exception):
    """业务异常 - 带 HTTP 状态码 + 错误码 + 人类可读消息 + 可选 detail。

    用法: raise AppError(404, ErrorCode.NOT_FOUND, "视频不存在")
    全局 handler 捕获后转为 {"code", "message", "detail"?} envelope。
    """

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        detail: Any | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(message)


class DomainError(AppError):
    """领域规则违反 - service 层用子类表达「哪种错」，而不是抛自由文本。

    为什么必须是 AppError 的子类而不是并列：``create_app()`` 里已经有一个
    ``AppError`` handler，继承意味着新增子类**不需要碰 main.py**，也不会有
    任何一个子类漏掉而退化成 500。

    为什么需要它：service 层过去抛 ``raise ValueError("... not found")``，由
    router 用 ``if "not found" in msg.lower()`` 反解状态码 —— 状态码由散文
    决定，措辞一改（翻译、大小写、加个词）就静默变成 500。子类把「哪个状态
    码」变成类型系统的事。

    子类只设类属性、不改 ``__init__`` 签名，于是调用点是
    ``raise NotFoundError("视频不存在")``。
    """

    status_code: int = 500
    code: str = ErrorCode.INTERNAL_ERROR

    def __init__(self, message: str, detail: Any | None = None) -> None:
        super().__init__(self.status_code, self.code, message, detail)


class NotFoundError(DomainError):
    """资源不存在（或对当前身份不可见）→ 404。

    「不可见」与「不存在」用同一个状态码是刻意的：区分二者会把别人的私有
    资源的存在性泄露给枚举者。
    """

    status_code = 404
    code = ErrorCode.NOT_FOUND


class BadRequestError(DomainError):
    """请求语义非法 → 400。

    与 422 的分界：422 是**格式/类型**错（pydantic 在校验层拦下），400 是
    格式对但**状态或规则**不允许这次操作。
    """

    status_code = 400
    code = ErrorCode.BAD_REQUEST


class ForbiddenError(DomainError):
    """当前身份不允许这次操作 → 403。"""

    status_code = 403
    code = ErrorCode.FORBIDDEN


class ConflictError(DomainError):
    """与当前资源状态冲突（重复提交、已处理、正在处理中）→ 409。"""

    status_code = 409
    code = ErrorCode.CONFLICT


class ServiceUnavailableError(DomainError):
    """下游依赖暂时不可用 → 503（区别于 AIServiceError 的 502）。"""

    status_code = 503
    code = ErrorCode.SERVICE_UNAVAILABLE


def format_validation_errors(errors: list[dict]) -> str:
    """把 Pydantic 422 errors 数组拼成人类可读字符串: 'field: msg; field: msg'。"""
    parts: list[str] = []
    for err in errors:
        loc = err.get("loc") or []
        field = loc[-1] if loc else "?"
        msg = str(err.get("msg", "")).replace("Value error, ", "")
        parts.append(f"{field}: {msg}")
    return "; ".join(parts)


def json_safe_non_finite(value: Any) -> Any:
    """递归把非有限浮点数换成它的文本形式, 其余原样返回。

    响应统一由 Starlette 的 ``json.dumps(..., allow_nan=False)`` 渲染, 所以
    payload 里只要有一个 ``nan``/``inf``, **整个响应**都序列化不出来。而 422
    envelope 会把「客户端传进来的那个值」原样回显在 ``detail[].input`` 里 ——
    ``NaN`` 又是可以走正常 body 路径进来的（stdlib 的 JSON parser 接受裸
    ``NaN``/``Infinity`` token）, 于是「请求格式错」被答成 500, 且没有任何可用
    信息。换成文本形式而不是丢掉, 是因为 ``nan``/``inf``/``-inf`` 三者的区别
    对定位问题有用, 而它们本来就没有对应的 JSON number。

    只处理 envelope 回显客户端输入的这一侧; 业务数据里出现非有限浮点是另一个
    问题（写入侧应各自用 ``allow_inf_nan=False`` 拦住）。
    """
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)  # 'nan' / 'inf' / '-inf'
    if isinstance(value, dict):
        return {key: json_safe_non_finite(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe_non_finite(item) for item in value]
    return value

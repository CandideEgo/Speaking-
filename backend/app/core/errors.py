"""统一错误处理 - 错误码 + AppError + 全局 envelope。

后端所有错误响应经 main.py 全局 handler 转为统一 envelope:

    {"code": "<ErrorCode>", "message": "<人类可读>", "detail": <可选原始 detail>}

- AppError: 业务代码显式抛出，带 code + message (+ optional detail)。
- HTTPException: 存量 150 处，全局 handler 兜底转 envelope，code = HTTP_{status}。
- RequestValidationError (422): code = VALIDATION_ERROR, detail = pydantic errors 数组。

前端 ApiClientError.code / .message 落地可用（之前 code 永远 null、message 从 detail 解析）。
"""

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

    # AI
    AI_SERVICE_UNAVAILABLE = "AI_SERVICE_UNAVAILABLE"

    # 支付/兑换
    PAYMENTS_DISABLED = "PAYMENTS_DISABLED"
    INVALID_REDEEM_CODE = "INVALID_REDEEM_CODE"

    # 配额
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"

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


def format_validation_errors(errors: list[dict]) -> str:
    """把 Pydantic 422 errors 数组拼成人类可读字符串: 'field: msg; field: msg'。"""
    parts: list[str] = []
    for err in errors:
        loc = err.get("loc") or []
        field = loc[-1] if loc else "?"
        msg = str(err.get("msg", "")).replace("Value error, ", "")
        parts.append(f"{field}: {msg}")
    return "; ".join(parts)

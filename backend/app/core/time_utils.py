"""时间归一工具 —— 「naive datetime → aware UTC」的唯一实现。

Postgres 的 ``DateTime(timezone=True)`` 列读回来是 aware 的，但 SQLite（测试
用内存 SQLite）读回来会丢 ``tzinfo``。拿 naive 值去和 ``datetime.now(UTC)``
比较会抛 ``TypeError``，所以比较前统一走这里。

放在 ``app/core/`` 而不是 ``app/api/``：``app/services/`` 反向 import
``app/api/`` 是倒置依赖 —— 服务层不该知道 HTTP 层的存在，也就不会出现
「core 里的时间工具只能被 api 导入、service 只能去 api 拿」的分层倒置。

调用方统一用 ``to_aware_utc`` 这个名字（不再有各模块私有的 ``_to_aware_utc``
副本），一条事实只放一个家。
"""

from datetime import UTC, datetime

__all__ = ["to_aware_utc"]


def to_aware_utc(value: datetime) -> datetime:
    """把 ``value`` 归一成 aware UTC；naive 值按 UTC 解释。

    Args:
        value: 任意 datetime。naive（无 tzinfo）视为已经是 UTC。

    Returns:
        tzinfo 为 UTC 的 datetime。
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)

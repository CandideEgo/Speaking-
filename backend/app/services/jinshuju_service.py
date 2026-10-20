"""金数据（Jinshuju）外部收款 → 自动开通 Pro。

站内不收款（ICP 合规，见 ``settings.payments_enabled`` 的注释）。会员在托管
于金数据的收款页成交后，本模块负责：

1. 通过金数据开放接口拉取「已付款」的数据记录（``trade_status`` 判定）；
2. 校验档位与实付金额（价格是防线，金额不符一律不自动开通）；
3. 按买家填写的手机号找到 SeeWord 账号，把 Pro 有效期延长对应天数；
4. 手机号还没注册时先把订单留在 ``pending``，等该手机号首次短信登录时补发
   （``apply_pending_grants``）。

调用入口有两个：Celery beat 的定时同步（``tasks.payment_tasks``，补漏）和
金数据的数据推送 webhook（``api/v1/payments.py``，秒级）。两者都走
``process_entry``，幂等键是金数据的数据记录 ``entry_token``。
"""

import base64
import hashlib
import hmac
import json
import re
from datetime import UTC, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.jinshuju_payment import JinshujuPayment, JinshujuPaymentStatus
from app.models.user import PlanType, User

logger = structlog.get_logger()

#: 金数据开放接口 v1 的实际 API 主机（open.jinshuju.net 只是文档站）。
JINSHUJU_API_BASE = "https://jinshuju.net/api/v1"

#: 金数据支付页把以下 trade_status 视作「已付款」（判定逻辑来自其支付页
#: 前端源码的 TradeStatus 集合）。其余状态（WAIT_BUYER_PAY / TRADE_CLOSED…）
#: 一律按未付款处理。
PAID_TRADE_STATUSES = frozenset(
    {"SUCCESS", "WAIT_SELLER_SEND_GOODS", "WAIT_BUYER_CONFIRM_GOODS", "TRADE_FINISHED", "TRADE_SUCCESS"}
)

#: 退款状态：只落账、不自动回收已发放的会员（人工决定是否追回）。
REFUNDED_TRADE_STATUSES = frozenset({"refunded", "partial_refunded"})

#: 档位 → (天数, 应付金额（分）)。与金数据表单 field_2 的商品名一一对应；
#: 改价/改名时这里和表单要一起改，金额不符的订单会被拒绝自动开通。
TIER_RULES: dict[str, tuple[int, int]] = {
    "月卡": (30, 1990),
    "季卡": (90, 4990),
    "年卡": (365, 19990),
}

#: 站内购买链接里携带的扩展属性字段（免费版可用的数据来源追踪）。
PURCHASE_TOKEN_X_FIELD = "x_field_1"

_BEIJING = timezone(timedelta(hours=8))


class JinshujuError(RuntimeError):
    """金数据接口调用失败 / 返回结构异常。"""


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _beijing_now() -> datetime:
    return datetime.now(_BEIJING)


def _to_aware_utc(value: datetime) -> datetime:
    """SQLite 读回来可能丢 tzinfo；统一成 aware UTC 再比较。"""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


# ---------------------------------------------------------------------------
# 站内购买标识（x_field_1）
# ---------------------------------------------------------------------------
# 免费版的金数据只支持「扩展属性追踪」x_field_1，它没有签名保护，所以这里
# 不直接放明文用户 ID，而是放一个带 HMAC + 过期时间的紧凑 token：
#   <user_id>.<exp_ts>.<base64url(hmac_sha256(payload)[:16])>
# 篡改/过期都会验签失败；解析成功后按 user_id 发会员，完全不需要手机号。


def _purchase_secret() -> str:
    settings = get_settings()
    return settings.jinshuju_purchase_token_secret or settings.jwt_secret


def create_purchase_token(user_id: str, ttl_minutes: int | None = None) -> str:
    settings = get_settings()
    ttl = ttl_minutes if ttl_minutes is not None else settings.jinshuju_purchase_token_ttl_minutes
    expires_at = int(_utcnow().timestamp()) + max(1, ttl) * 60
    payload = f"{user_id}.{expires_at}"
    digest = hmac.new(_purchase_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()[:16]
    signature = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return f"{payload}.{signature}"


def verify_purchase_token(token: str) -> str | None:
    """验签并返回 user_id；无效/被篡改/过期一律返回 None。"""
    if not token or token.count(".") != 2:
        return None
    user_id, expires_at_raw, signature = token.split(".")
    payload = f"{user_id}.{expires_at_raw}"
    digest = hmac.new(_purchase_secret().encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()[:16]
    expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        expires_at = int(expires_at_raw)
    except ValueError:
        return None
    if expires_at < int(_utcnow().timestamp()):
        return None
    return user_id or None


def purchase_url_for(user_id: str) -> tuple[str, int]:
    """生成带签名的站内购买链接，返回 (url, 有效期秒数)。"""
    settings = get_settings()
    if not settings.jinshuju_purchase_url:
        raise JinshujuError("JINSHUJU_PURCHASE_URL 未配置")
    token = create_purchase_token(user_id)
    base = settings.jinshuju_purchase_url
    separator = "&" if "?" in base else "?"
    url = f"{base}{separator}{PURCHASE_TOKEN_X_FIELD}={quote(token, safe='')}"
    ttl_seconds = max(1, settings.jinshuju_purchase_token_ttl_minutes) * 60
    return url, ttl_seconds


def _api_headers() -> dict[str, str]:
    settings = get_settings()
    return {
        "Authorization": f"Bearer {settings.jinshuju_access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


async def _get_json(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    settings = get_settings()
    if not settings.jinshuju_access_token:
        raise JinshujuError("JINSHUJU_ACCESS_TOKEN 未配置")
    url = f"{JINSHUJU_API_BASE}{path}"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, params=params, headers=_api_headers())
    except httpx.HTTPError as exc:
        raise JinshujuError(f"请求 {url} 失败: {exc}") from exc
    if resp.status_code != 200:
        raise JinshujuError(f"GET {path} 返回 HTTP {resp.status_code}: {resp.text[:300]}")
    try:
        data = resp.json()
    except ValueError as exc:
        raise JinshujuError(f"GET {path} 返回非 JSON") from exc
    if not isinstance(data, dict):
        raise JinshujuError(f"GET {path} 返回结构异常: {type(data).__name__}")
    return data


# ---------------------------------------------------------------------------
# 金数据 API 读取
# ---------------------------------------------------------------------------


async def fetch_entry(serial_number: int) -> dict[str, Any]:
    """按数据序号取单条记录（webhook 之后用它做权威核对）。"""
    settings = get_settings()
    data = await _get_json(f"/forms/{settings.jinshuju_form_token}/entries/{serial_number}")
    entry = data.get("entry")
    if not isinstance(entry, dict):
        raise JinshujuError(f"entry {serial_number} 结构异常")
    return entry


async def fetch_recent_entries(created_at: str) -> list[dict[str, Any]]:
    """拉取 ``created_at`` 之后的数据（北京时间字符串，接口时区固定北京）。"""
    settings = get_settings()
    entries: list[dict[str, Any]] = []
    params: dict[str, Any] = {"created_at": created_at, "limit": 1000}
    # 防御性上限：单轮最多 10 页（1 万条），避免异常 next 把任务拖死。
    for _ in range(10):
        data = await _get_json(f"/forms/{settings.jinshuju_form_token}/entries", params)
        page = data.get("data")
        if isinstance(page, list):
            entries.extend(item for item in page if isinstance(item, dict))
        next_cursor = data.get("next")
        if next_cursor is None:
            break
        params = {"next": next_cursor, "limit": 1000}
    return entries


# ---------------------------------------------------------------------------
# 字段解析
# ---------------------------------------------------------------------------


def _field_value(entry: dict[str, Any], api_code: str) -> Any:
    """取字段值；兼容 ``include_labels`` 的 ``{label, value}`` 包装。"""
    raw = entry.get(api_code)
    if isinstance(raw, dict) and "value" in raw:
        return raw["value"]
    return raw


def _normalize_phone(value: Any) -> str | None:
    if isinstance(value, dict):
        value = value.get("value")
    if not isinstance(value, str):
        return None
    digits = re.sub(r"\D", "", value)
    if digits.startswith("86") and len(digits) == 13:
        digits = digits[2:]
    return digits if re.fullmatch(r"1\d{10}", digits) else None


def _match_tier(entry: dict[str, Any]) -> tuple[str, int, int] | None:
    """返回 (档位名, 天数, 应付金额分)；认不出档位时返回 None。"""
    settings = get_settings()
    raw = _field_value(entry, settings.jinshuju_tier_field)
    items = raw if isinstance(raw, list) else []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if isinstance(name, str) and name in TIER_RULES:
            days, price_fen = TIER_RULES[name]
            return name, days, price_fen
    return None


def _amount_fen(value: Any) -> int | None:
    try:
        return round(float(value) * 100)
    except (TypeError, ValueError):
        return None


def _parse_entry_created_at(entry: dict[str, Any]) -> datetime | None:
    value = entry.get("created_at")
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# 落库 / 开通
# ---------------------------------------------------------------------------


def _extend_pro(user: User, days: int) -> None:
    """延长 Pro；续费从「当前到期时间与现在较晚者」起算（与站内支付一致）。"""
    now = _utcnow()
    current = _to_aware_utc(user.plan_expires_at) if user.plan_expires_at else now
    base = max(current, now)
    user.plan = PlanType.pro
    user.plan_expires_at = base + timedelta(days=days)
    user.plan_source = "purchase"


async def _find_record(db: AsyncSession, entry_token: str) -> JinshujuPayment | None:
    result = await db.execute(select(JinshujuPayment).where(JinshujuPayment.entry_token == entry_token))
    return result.scalar_one_or_none()


def _record_fields(entry: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    return {
        "serial_number": int(entry.get("serial_number") or 0),
        "form_token": settings.jinshuju_form_token
        or str(entry.get("form") or "")
        or str(entry.get("form_token") or ""),
        "trade_status": (str(entry.get("trade_status")) if entry.get("trade_status") is not None else None),
        "trade_no": (str(entry.get("trade_no")) if entry.get("trade_no") else None),
        "payment_method": (str(entry.get("payment_method")) if entry.get("payment_method") else None),
        "entry_created_at": _parse_entry_created_at(entry),
        "raw_json": json.dumps(entry, ensure_ascii=False)[:200_000],
    }


async def _upsert_record(db: AsyncSession, entry: dict[str, Any]) -> JinshujuPayment:
    """按 entry_token 新增/更新落账行（并发插入撞唯一键时回读）。"""
    entry_token = str(entry.get("token") or "")
    record = await _find_record(db, entry_token)
    if record is None:
        record = JinshujuPayment(entry_token=entry_token, created_at=_utcnow(), **_record_fields(entry))
        db.add(record)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            record = await _find_record(db, entry_token)
            if record is None:
                raise
        return record
    for key, value in _record_fields(entry).items():
        setattr(record, key, value)
    await db.commit()
    return record


async def _mark_ignored(
    db: AsyncSession, entry: dict[str, Any], reason: str, *, phone: str | None = None, tier_name: str | None = None
) -> None:
    record = await _upsert_record(db, entry)
    record.phone = phone or record.phone
    record.tier_name = tier_name or record.tier_name
    record.status = JinshujuPaymentStatus.IGNORED
    record.error_message = reason[:500]
    await db.commit()
    logger.warning(
        "jinshuju_entry_ignored",
        entry_token=record.entry_token,
        serial_number=record.serial_number,
        reason=reason,
    )


async def _grant_and_mark_applied(
    db: AsyncSession, record: JinshujuPayment, *, phone: str | None = None, user_id: str | None = None
) -> str:
    """在行锁下发放：先锁用户，再回读订单状态，避免并发重复延长。

    账号来源二选一：站内购买的签名 token 给出 ``user_id``（B 方案，零填写），
    或老链路的手机号匹配 ``phone``。两者都没有时返回 ``pending``。
    """
    if user_id:
        user = (await db.execute(select(User).where(User.id == user_id).with_for_update())).scalar_one_or_none()
    elif phone:
        user = (await db.execute(select(User).where(User.phone == phone).with_for_update())).scalar_one_or_none()
    else:
        return "pending"
    if user is None:
        return "pending"
    fresh = (
        await db.execute(select(JinshujuPayment).where(JinshujuPayment.id == record.id).with_for_update())
    ).scalar_one_or_none()
    if fresh is None:
        return "error"
    if fresh.status == JinshujuPaymentStatus.APPLIED:
        return "already_applied"
    days = fresh.duration_days or 0
    if days <= 0:
        fresh.status = JinshujuPaymentStatus.IGNORED
        fresh.error_message = "订单缺少有效时长"
        await db.commit()
        return "ignored"
    _extend_pro(user, days)
    fresh.status = JinshujuPaymentStatus.APPLIED
    fresh.user_id = user.id
    fresh.applied_at = _utcnow()
    await db.commit()
    logger.info(
        "jinshuju_pro_granted",
        user_id=user.id,
        entry_token=fresh.entry_token,
        tier=fresh.tier_name,
        days=days,
        expires_at=user.plan_expires_at.isoformat() if user.plan_expires_at else None,
    )
    return "applied"


async def process_entry(db: AsyncSession, entry: dict[str, Any]) -> str:
    """处理一条金数据记录，返回结果标签（用于日志/测试断言）。

    结果标签：``already_applied`` / ``not_paid`` / ``refunded`` / ``ignored`` /
    ``amount_mismatch`` / ``applied`` / ``pending`` / ``invalid``。
    """
    entry_token = str(entry.get("token") or "").strip()
    if not entry_token:
        return "invalid"

    record = await _find_record(db, entry_token)
    trade_status = str(entry.get("trade_status") or "").strip()
    if trade_status in REFUNDED_TRADE_STATUSES:
        if record is not None:
            record.status = JinshujuPaymentStatus.REFUNDED
            record.trade_status = trade_status
            await db.commit()
            logger.warning("jinshuju_entry_refunded", entry_token=entry_token)
        return "refunded"
    if record is not None and record.status == JinshujuPaymentStatus.APPLIED:
        return "already_applied"
    if trade_status not in PAID_TRADE_STATUSES:
        return "not_paid"

    settings = get_settings()
    purchase_user_id = verify_purchase_token(str(_field_value(entry, PURCHASE_TOKEN_X_FIELD) or "").strip())
    phone = _normalize_phone(_field_value(entry, settings.jinshuju_phone_field))
    tier = _match_tier(entry)
    amount_fen = _amount_fen(entry.get("total_price"))

    if tier is None or amount_fen is None:
        await _mark_ignored(db, entry, "无法识别档位/金额（表单字段或商品名可能已改动）", phone=phone)
        return "ignored"
    tier_name, days, price_fen = tier
    if amount_fen != price_fen:
        await _mark_ignored(
            db,
            entry,
            f"实付 {amount_fen / 100:.2f} 元与「{tier_name}」价格 {price_fen / 100:.2f} 元不符",
            phone=phone,
            tier_name=tier_name,
        )
        return "amount_mismatch"
    if purchase_user_id is None and phone is None:
        await _mark_ignored(
            db,
            entry,
            "缺少有效购买标识（x_field_1 缺失/被篡改/已过期），无法确定账号",
            tier_name=tier_name,
        )
        return "ignored"

    record = await _upsert_record(db, entry)
    if record.status == JinshujuPaymentStatus.APPLIED:
        return "already_applied"
    record.phone = phone
    record.tier_name = tier_name
    record.amount_fen = amount_fen
    record.duration_days = days
    record.status = JinshujuPaymentStatus.PENDING
    record.error_message = None
    await db.commit()
    outcome = await _grant_and_mark_applied(db, record, phone=phone, user_id=purchase_user_id)
    if outcome == "pending" and purchase_user_id:
        record.status = JinshujuPaymentStatus.IGNORED
        record.error_message = "购买标识对应的账号不存在或已注销"
        await db.commit()
        return "ignored"
    return outcome


async def apply_pending_grants(db: AsyncSession, user: User) -> int:
    """该手机号首次登录时，把此前挂起的已付款订单补发成 Pro。

    返回本次发放的订单数。调用方负责吞异常 —— 补发失败不能挡住登录。
    """
    settings = get_settings()
    if not settings.jinshuju_enabled or not user.phone:
        return 0
    rows = (
        (
            await db.execute(
                select(JinshujuPayment)
                .where(
                    JinshujuPayment.phone == user.phone,
                    JinshujuPayment.status == JinshujuPaymentStatus.PENDING,
                )
                .with_for_update(skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    applied = 0
    for record in rows:
        days = record.duration_days or 0
        if days <= 0:
            record.status = JinshujuPaymentStatus.IGNORED
            record.error_message = "订单缺少有效时长"
            continue
        _extend_pro(user, days)
        record.status = JinshujuPaymentStatus.APPLIED
        record.user_id = user.id
        record.applied_at = _utcnow()
        applied += 1
    if rows:
        await db.commit()
    if applied:
        logger.info("jinshuju_pending_grants_applied", user_id=user.id, count=applied)
    return applied


async def sync_recent_entries(db: AsyncSession) -> dict[str, Any]:
    """同步最近窗口内的数据并处理已付款记录。返回各结果计数（日志用）。"""
    settings = get_settings()
    if not settings.jinshuju_enabled:
        return {"skipped": "disabled"}
    if not settings.jinshuju_access_token or not settings.jinshuju_form_token:
        logger.warning("jinshuju_sync_unconfigured")
        return {"skipped": "unconfigured"}

    since = _beijing_now() - timedelta(hours=max(1, settings.jinshuju_sync_lookback_hours))
    entries = await fetch_recent_entries(since.strftime("%Y-%m-%d %H:%M:%S"))
    counts: dict[str, int] = {}
    for entry in entries:
        try:
            outcome = await process_entry(db, entry)
        except Exception:
            logger.exception("jinshuju_entry_process_failed", serial_number=entry.get("serial_number"))
            outcome = "error"
        counts[outcome] = counts.get(outcome, 0) + 1
    logger.info("jinshuju_sync_done", total=len(entries), outcomes=counts)
    return {"total": len(entries), **counts}

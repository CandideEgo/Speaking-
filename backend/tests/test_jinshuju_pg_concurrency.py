"""金数据两条发放路径的并发回归测试（真 Postgres）。

背景：``app/services/jinshuju_service.py`` 有两条会并发的会员发放路径 ——
路径 A ``process_entry``（webhook / 定时同步收到「已付款」后立即开通）与
路径 B ``apply_pending_grants``（该手机号首次登录时补发此前挂起的订单）。
修复前两条路径的**锁序相反**：

* 路径 A：锁 ``users`` → 锁 ``jinshuju_payments``
* 路径 B：锁 ``jinshuju_payments`` →（commit 时 flush）UPDATE ``users``

构成经典 ABBA，Postgres 会杀掉其中一个事务（SQLSTATE 40P01 /
``DeadlockDetectedError``）；被杀的那条若发生在 Celery 任务里会被吞掉不再
重试 —— 那笔已付款订单就永远开不了通。

内存 SQLite 表达不了行锁语义（``with_for_update`` / ``skip_locked`` 被静默
忽略），所以这条不变式只能在这条真 Postgres 上断言 —— 与
``tests/test_celery_tasks_pg.py`` 用同一套约定（``pytestmark =
pytest.mark.integration``；Postgres 不可达时按 conftest 的既有约定自动
skip；CI 的 backend job 备了 Postgres，所以那边是真跑的）。

断言两件事：

1. 并发下**不出现死锁**（SQLSTATE 40P01）；
2. **最终延后天数恰好等于订单天数之和**。修复前这里会**多发**：锁外无条件
   写 ``status=pending`` 会覆盖并发路径刚写的 ``applied``，加上加锁回读
   拿到的是 identity map 里的旧对象 → 同一笔订单被发放两次（实测 3 笔
   30 天订单给成了 120 天）。

本测试**扫**路径 B 的起跑延时（不是随机抖动）：ABBA 那个窗口只有一次
数据库往返宽（本地约 0.5ms），而 Windows 上 ``asyncio.sleep`` 的时钟
粒度（~15ms）会把它整个吞掉 —— 所以用 ``sleep(0)`` 自旋到目标时刻再放行
B。扫延时是为了让「修复前」的实现真的能撞出死锁：只在随机交错下跑，
本测试在旧实现上会假绿。

所有任务先用 ``asyncio.Barrier`` **汇合**再各跑各的：conftest 的 PG 引擎用
``NullPool``（每次 session 都新建连接，本机约 36ms），若把连接建立也算进
交错窗口里，延时档位就会被这几十毫秒淹没、扫不到真正的 ABBA 窗口 ——
所以先建连接、再汇合、最后才开始计时的业务动作。

**目标库会被整个 schema drop 重建**（conftest 的 integration 分支就是这么
做的），所以只能指向一次性测试库：

    docker compose -f docker-compose.dev.yml up -d db
    PG_TEST_URL=postgresql+asyncpg://seeword:seeword_dev@localhost:5432/seeword_jinshuju_test \\
        pytest tests/test_jinshuju_pg_concurrency.py -v

轮数默认 40（CI 时限内跑得完），要拉大用环境变量：

    JINSHUJU_CONCURRENCY_ROUNDS=150 pytest tests/test_jinshuju_pg_concurrency.py -v
"""

from __future__ import annotations

import asyncio
import os
import re
import time
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, event, select

from app.core.config import get_settings
from app.core.database import get_async_session_maker
from app.models.jinshuju_payment import JinshujuPayment, JinshujuPaymentStatus
from app.models.user import PlanType, User
from app.services import jinshuju_service

pytestmark = pytest.mark.integration

PHONE = "13800009901"
FORM_TOKEN = "ed8TXL"
TIER = "月卡"
PRICE = 19.9
DAYS = 30
N_ORDERS = 3

#: 轮数：默认够在 CI 时限内跑完，又能把 ABBA 窗口扫到。
ROUNDS = int(os.environ.get("JINSHUJU_CONCURRENCY_ROUNDS", "40"))
#: 每轮扫的延时档位数与档长（秒）。ABBA 窗口 ≈ 一次 DB 往返（本地 ~0.5ms），
#: 所以档长取 50µs、覆盖 0~2.45ms。
DELAY_STEPS = 50
DELAY_STEP_SECONDS = 0.00005


def _session_maker():
    """解析「被路由到 Postgres 的」session 工厂。

    conftest 的 integration 分支把 ``app.core.database.async_session`` 换成
    Postgres 版；``get_async_session_maker`` 在**调用时**读它，所以这里拿到
    的就是 Postgres。
    """
    return get_async_session_maker()


def _entry(index: int) -> dict:
    """一条「已付款」的金数据 entry（不发网络请求：``process_entry`` 只吃 dict）。"""
    return {
        "token": f"pg-entry-{index}",
        "serial_number": index + 1,
        "form": FORM_TOKEN,
        "trade_status": "TRADE_SUCCESS",
        "trade_no": f"pg-trade-{index}",
        "payment_method": "WX_PAY",
        "total_price": PRICE,
        "field_2": [{"name": TIER, "number": 1, "price": PRICE}],
        "field_5": PHONE,
        "x_field_1": "",
        "created_at": "2026-10-18T15:51:40.521Z",
    }


async def _spin(seconds: float) -> None:
    """亚毫秒级延时（见模块 docstring：``asyncio.sleep`` 在 Windows 上太粗）。"""
    t0 = time.perf_counter()
    while time.perf_counter() - t0 < seconds:
        await asyncio.sleep(0)


def _first_row_lock(statements: list[str], table: str) -> int | None:
    """第一条对 ``table`` 取行锁（``SELECT ... FOR UPDATE``）的语句下标。"""
    for index, statement in enumerate(statements):
        if "FOR UPDATE" in statement and re.search(rf"FROM {table}\b", statement):
            return index
    return None


async def _path_a(index: int, barrier: asyncio.Barrier) -> None:
    """路径 A：webhook / 定时同步收到「已付款」→ ``process_entry``。"""
    async with _session_maker()() as db:
        try:
            await db.execute(select(1))  # 先把连接建好（NullPool：每次 session 都新建连接）
            await barrier.wait()
        except BaseException:
            barrier.abort()  # 别让别的任务在 barrier 上干等
            raise
        await jinshuju_service.process_entry(db, _entry(index))


async def _path_b(user_id: str, barrier: asyncio.Barrier, delay: float) -> None:
    """路径 B：该手机号首次登录 → ``apply_pending_grants``。"""
    async with _session_maker()() as db:
        try:
            user = await db.get(User, user_id)
            await barrier.wait()
        except BaseException:
            barrier.abort()
            raise
        await _spin(delay)
        await jinshuju_service.apply_pending_grants(db, user)


@pytest.fixture
def jinshuju_on(monkeypatch):
    """打开金数据开关并对齐表单字段名（与 tests/test_jinshuju.py 同一套）。"""
    settings = get_settings()
    monkeypatch.setattr(settings, "jinshuju_enabled", True)
    monkeypatch.setattr(settings, "jinshuju_form_token", FORM_TOKEN)
    monkeypatch.setattr(settings, "jinshuju_tier_field", "field_2")
    monkeypatch.setattr(settings, "jinshuju_phone_field", "field_5")
    monkeypatch.setattr(settings, "jinshuju_access_token", "pg-test-access-token")
    monkeypatch.setattr(settings, "jinshuju_purchase_token_secret", "pg-test-purchase-secret")
    monkeypatch.setattr(settings, "jinshuju_purchase_token_ttl_minutes", 120)
    return settings


async def _reset_round(db, user_id: str) -> None:
    """把这一轮重置成「3 笔挂起订单 + 免费用户」。"""
    await db.execute(delete(JinshujuPayment))
    user = await db.get(User, user_id)
    user.plan = PlanType.free
    user.plan_expires_at = None
    user.plan_source = None
    db.add_all(
        [
            JinshujuPayment(
                entry_token=f"pg-entry-{i}",
                serial_number=i + 1,
                form_token=FORM_TOKEN,
                phone=PHONE,
                tier_name=TIER,
                amount_fen=1990,
                duration_days=DAYS,
                trade_status="TRADE_SUCCESS",
                status=JinshujuPaymentStatus.PENDING,
            )
            for i in range(N_ORDERS)
        ]
    )
    await db.commit()


async def test_concurrent_grants_do_not_deadlock_and_grant_exactly_once(jinshuju_on):
    """并发发放：不死锁，且每笔订单只发一次（总天数恰好等于订单天数之和）。"""
    async with _session_maker()() as db:
        user = User(phone=PHONE, name="PG Jinshuju", plan=PlanType.free)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        user_id = user.id

    try:
        for rnd in range(ROUNDS):
            async with _session_maker()() as db:
                await _reset_round(db, user_id)

            # 所有任务先建好连接再汇合；路径 B 晚一点点放行 —— 延时按轮次扫描，
            # 让「修复前」的锁序真的能撞出 ABBA。
            barrier = asyncio.Barrier(N_ORDERS + 1)
            tasks = [asyncio.create_task(_path_a(i, barrier)) for i in range(N_ORDERS)]
            tasks.append(asyncio.create_task(_path_b(user_id, barrier, (rnd % DELAY_STEPS) * DELAY_STEP_SECONDS)))
            results = await asyncio.gather(*tasks, return_exceptions=True)

            failures = [r for r in results if isinstance(r, BaseException)]
            for failure in failures:
                sqlstate = getattr(getattr(failure, "orig", None), "sqlstate", None)
                assert sqlstate != "40P01", (
                    f"第 {rnd} 轮出现死锁（DeadlockDetectedError / SQLSTATE 40P01）：{failure!r}"
                )
            assert not failures, f"第 {rnd} 轮出现非死锁异常：{[repr(f) for f in failures]}"

        async with _session_maker()() as db:
            user = await db.get(User, user_id)
            rows = (await db.execute(select(JinshujuPayment))).scalars().all()
            applied = [r for r in rows if r.status == JinshujuPaymentStatus.APPLIED]
            pending = [r for r in rows if r.status == JinshujuPaymentStatus.PENDING]
            remaining_days = None
            if user.plan_expires_at is not None:
                remaining_days = (user.plan_expires_at - datetime.now(UTC)).days

        # 不漏单：每笔订单都发到了，且没有「付款了却还是挂起」的。
        assert user.plan == PlanType.pro
        assert len(applied) == N_ORDERS, f"应有 {N_ORDERS} 笔已发放，实际 {len(applied)}"
        assert not pending, f"仍有未发放的挂起订单：{[r.entry_token for r in pending]}"
        # 不多发：总天数恰好是订单天数之和（修复前这里是 120 天 = 90×4/3）。
        expected = N_ORDERS * DAYS
        assert remaining_days is not None, "会员有效期没有被延长"
        assert expected - 1 <= remaining_days <= expected, (
            f"最终延后天数应为 {expected} 天，实际 {remaining_days} 天（多发=重复发放，少发=漏单）"
        )
    finally:
        # 清理：本测试建的数据删干净（不留在目标库里）。
        async with _session_maker()() as db:
            await db.execute(delete(JinshujuPayment))
            await db.execute(delete(User).where(User.id == user_id))
            await db.commit()


async def test_both_grant_paths_lock_users_before_payments(jinshuju_on):
    """锁序不变式（确定性断言，不靠并发时序去撞）。

    两条发放路径都必须**先锁 users、再锁 jinshuju_payments**。修复前的路径 B
    是反的：它先 ``SELECT jinshuju_payments ... FOR UPDATE SKIP LOCKED``，
    用户行的锁要等到 commit 时 flush ``UPDATE users`` 才拿到 —— 这就是 ABBA
    的另一半。

    这里直接断言**实际发出的 SQL 顺序**：ABBA 的窗口只有一次数据库往返宽
    （亚毫秒），靠并发时序去撞既慢又不可靠；而「锁序」本身就是那条不变式，
    断言它既确定又能直接指出是谁反了。
    """
    maker = _session_maker()
    bind = maker.kw.get("bind")
    sync_engine = getattr(bind, "sync_engine", bind)
    statements: list[str] = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(sync_engine, "before_cursor_execute", _record)
    try:
        async with maker() as db:
            user = User(phone=PHONE, name="PG Lock Order", plan=PlanType.free)
            db.add(user)
            await db.commit()
            await db.refresh(user)
            user_id = user.id
            db.add(
                JinshujuPayment(
                    entry_token="pg-lock-order-0",
                    serial_number=1,
                    form_token=FORM_TOKEN,
                    phone=PHONE,
                    tier_name=TIER,
                    amount_fen=1990,
                    duration_days=DAYS,
                    trade_status="TRADE_SUCCESS",
                    status=JinshujuPaymentStatus.PENDING,
                )
            )
            await db.commit()

        try:
            # 路径 A：webhook / 定时同步收到「已付款」。
            statements.clear()
            async with maker() as db:
                await jinshuju_service.process_entry(db, _entry(0))
            path_a_statements = list(statements)

            # 路径 B：该手机号首次登录时补发。
            statements.clear()
            async with maker() as db:
                user = await db.get(User, user_id)
                await jinshuju_service.apply_pending_grants(db, user)
            path_b_statements = list(statements)
        finally:
            async with maker() as db:
                await db.execute(delete(JinshujuPayment))
                await db.execute(delete(User).where(User.id == user_id))
                await db.commit()
    finally:
        event.remove(sync_engine, "before_cursor_execute", _record)

    for label, stmts in (
        ("路径 A (process_entry)", path_a_statements),
        ("路径 B (apply_pending_grants)", path_b_statements),
    ):
        users_lock = _first_row_lock(stmts, "users")
        payments_lock = _first_row_lock(stmts, "jinshuju_payments")
        assert users_lock is not None, f"{label} 没有先锁 users 行（只锁了订单行 → 与另一条路径构成 ABBA）"
        assert payments_lock is not None, f"{label} 没有锁 jinshuju_payments 行"
        assert users_lock < payments_lock, (
            f"{label} 的锁序反了：第 {payments_lock} 条先锁了 jinshuju_payments，第 {users_lock} 条才锁 users"
        )

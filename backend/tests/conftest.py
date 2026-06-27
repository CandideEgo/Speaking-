"""Shared test fixtures for Speaking backend tests.

Test database: in-memory SQLite (aiosqlite), isolated from the real Postgres.
Redis: an in-memory fake is injected via ``app.core.redis`` so that
quiz/notification flows can be tested without a live Redis server.

IMPORTANT: the async autouse fixtures (``_async_setup``) are scoped to async
tests only. Applying an async autouse fixture to a plain sync test makes
pytest-asyncio hang, which is why the suite previously deadlocked when sync
files (test_whisperx_segmentation, test_sr_service) were collected alongside
async files.
"""

import os
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Set env before any app imports so limiter/config pick up "testing"
os.environ["ENV"] = "testing"
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://speaking:speaking_dev@localhost:5432/speaking")
os.environ.setdefault("JWT_SECRET", "test_secret_for_pytest")
# The punctuation restoration model imports `transformers` (5.x), whose import
# hangs indefinitely on this platform. Disable it in tests — the module falls
# back to no-punctuation mode, and the dedicated tests assert graceful fallback.
os.environ.setdefault("PUNCTUATION_MODEL_DISABLED", "1")

# Force-register all ORM models on Base.metadata so the autouse
# _async_setup fixture can create_all() them, including models added
# after the ``create_app`` import above. (create_app does the same import
# but only when called; this conftest fixture runs before any test
# invokes create_app.)
from app import models
from app.core import redis as redis_module
from app.core.database import Base, get_db
from app.core.security import create_token, hash_password
from app.main import create_app

# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


class _FakeRedis:
    """Minimal in-memory async Redis substitute used in tests.

    Implements only the subset of commands the app relies on:
    get/set/setex/delete/exists/ping/aclose.
    """

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> str | None:
        self._store[key] = value
        return "OK"

    async def setex(self, key: str, ttl: int, value: str) -> str | None:
        self._store[key] = value
        return "OK"

    async def delete(self, key: str) -> int:
        existed = key in self._store
        self._store.pop(key, None)
        return 1 if existed else 0

    async def exists(self, key: str) -> bool:
        return key in self._store

    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:
        return None


def _is_async_test(request: pytest.FixtureRequest) -> bool:
    """Return True if the requesting test runs on an asyncio event loop.

    We detect this by checking for any async-detectable signal: the test node
    being a coroutine function, or any async fixtures in its argnames. This
    keeps the async autouse fixtures from being activated for plain sync tests.
    """
    node = request.node
    # pytest-asyncio marks coroutine tests; their fixtures appear in argnames.
    testfunc = getattr(node, "function", None)
    if testfunc is not None and hasattr(testfunc, "__code__") and testfunc.__code__.co_flags & 0x100:  # CO_COROUTINE
        return True
    # Fall back: an asyncio marker was applied.
    if node.get_closest_marker("asyncio") is not None:
        return True
    return False


@pytest.fixture(autouse=True)
def _mock_celery(monkeypatch):
    """Stub out Celery task dispatch so tests never block on the broker.

    ``process_video.delay(...)`` (and any other task) would otherwise try to
    reach the Redis broker at ``settings.redis_url`` and hang forever in the
    test environment (no broker running). We replace ``.delay`` / ``.apply_async``
    on every registered Celery task with no-ops that record their args, so tests
    that submit videos/orders still pass but no background work runs.
    """
    from app.tasks.celery_app import celery_app

    calls: list[tuple[str, tuple, dict]] = []

    class _FakeAsyncResult:
        """Minimal stand-in for celery's AsyncResult."""

        def __init__(self, task_id: str = "fake-task-id") -> None:
            self.id = task_id
            self.state = "PENDING"

        def get(self, timeout=None):
            return None

        def ready(self) -> bool:
            return False

        def successful(self) -> bool:
            return False

    def _make_noop(task_name: str):
        def _delay(*args, **kwargs):
            calls.append((task_name, args, kwargs))
            return _FakeAsyncResult()

        def _apply_async(*args, **kwargs):
            calls.append((task_name, args, kwargs))
            return _FakeAsyncResult()

        return _delay, _apply_async

    for task_name in list(celery_app.tasks):
        # Skip Celery's own built-in tasks (celery.*)
        if task_name.startswith("celery."):
            continue
        task = celery_app.tasks[task_name]
        delay_fn, apply_fn = _make_noop(task_name)
        monkeypatch.setattr(task, "delay", delay_fn)
        monkeypatch.setattr(task, "apply_async", apply_fn)

    # Expose recorded calls for tests that want to assert dispatch happened.
    monkeypatch._celery_calls = calls  # type: ignore[attr-defined]
    yield calls


@pytest_asyncio.fixture
async def fake_redis(request: pytest.FixtureRequest, monkeypatch):
    """An in-memory fake Redis, injected into ``app.core.redis``.

    Request this fixture in tests that need to inspect or assert on the Redis
    store (e.g. AI cache, vocab quiz staging). It is also installed implicitly
    by ``_async_setup`` for every async test, so async tests that don't need
    direct access can ignore it.

    Late ``from app.core.redis import get_redis`` imports resolve the name at
    call time, so patching the module attribute covers every caller.
    """
    fake = _FakeRedis()

    def _get_redis():
        return fake

    monkeypatch.setattr(redis_module, "get_redis", _get_redis)
    monkeypatch.setattr(redis_module, "_redis", fake)
    redis_module._test_fake_installed = True  # type: ignore[attr-defined]
    yield fake
    redis_module._test_fake_installed = False  # type: ignore[attr-defined]


@pytest_asyncio.fixture(autouse=True)
async def _async_setup(request: pytest.FixtureRequest, monkeypatch):
    """Create tables + inject fake Redis — but only for async tests.

    Runs ``create_all``/``drop_all`` around each async test on the in-memory
    SQLite engine and patches ``app.core.redis`` with an in-memory fake so
    Redis-backed features (token blacklist, vocab quiz staging) work without a
    live Redis. If a test already requested the ``fake_redis`` fixture, that
    same instance is reused (the fixture does the patching); otherwise we
    install a fresh one here.
    """
    if not _is_async_test(request):
        # Plain sync test (e.g. pure unit tests) — skip DB/Redis setup entirely.
        yield
        return

    # --- Database tables ---
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # --- Fake Redis (only if the test didn't already install one) ---
    if not getattr(redis_module, "_test_fake_installed", False):
        # No fake installed yet — install one for this test.
        fake = _FakeRedis()

        def _get_redis():
            return fake

        monkeypatch.setattr(redis_module, "get_redis", _get_redis)
        monkeypatch.setattr(redis_module, "_redis", fake)
        redis_module._test_fake_installed = True  # type: ignore[attr-defined]

    yield

    redis_module._test_fake_installed = False  # type: ignore[attr-defined]
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Async test client with test database + fake redis overrides."""
    app = create_app()
    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Raw database session for direct model manipulation."""
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture
def test_password() -> str:
    return "Testpass123!"


@pytest.fixture
def test_user_data() -> dict:
    return {
        "email": "test@example.com",
        "password": "Testpass123!",
        "name": "Test User",
    }


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient, test_user_data: dict, test_password: str) -> dict:
    """Create a test user, return Authorization headers with JWT."""
    from app.models.user import PlanType, RoleType, User

    async with TestSessionLocal() as db:
        user = User(
            email=test_user_data["email"],
            hashed_password=hash_password(test_password),
            name=test_user_data["name"],
            plan=PlanType.free,
            role=RoleType.user,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        token = create_token(user.id)
        return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def admin_headers(client: AsyncClient) -> dict:
    """Create an admin user, return Authorization headers."""
    from app.models.user import PlanType, RoleType, User

    async with TestSessionLocal() as db:
        user = User(
            email="admin@example.com",
            hashed_password=hash_password("Adminpass1!"),
            name="Admin",
            plan=PlanType.pro,
            plan_expires_at=datetime(2099, 12, 31),
            role=RoleType.admin,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        token = create_token(user.id)
        return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def pro_headers(client: AsyncClient) -> dict:
    """Create a Pro user with an active subscription, return Authorization headers."""
    from app.models.user import PlanType, RoleType, User

    async with TestSessionLocal() as db:
        user = User(
            email="pro@example.com",
            hashed_password=hash_password("Propass1!"),
            name="Pro User",
            plan=PlanType.pro,
            plan_expires_at=datetime(2099, 12, 31, tzinfo=UTC),
            role=RoleType.user,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        token = create_token(user.id)
        return {"Authorization": f"Bearer {token}"}

"""Shared test fixtures for Speaking backend tests."""
import asyncio
import os
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

# Set env before any app imports so limiter/config pick up "testing"
os.environ["ENV"] = "testing"
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://speaking:speaking_dev@localhost:5432/speaking")
os.environ.setdefault("JWT_SECRET", "test_secret_for_pytest")

from app.core.database import Base, get_db
from app.core.security import hash_password, create_token
from app.main import create_app

# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session")
def event_loop():
    """Create a single event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    """Create all tables before each test and drop them after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
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
    """Async test client with test database override."""
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
    return "testpass123"


@pytest.fixture
def test_user_data() -> dict:
    return {
        "email": "test@example.com",
        "password": "testpass123",
        "name": "Test User",
    }


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient, test_user_data: dict, test_password: str) -> dict:
    """Create a test user, return Authorization headers with JWT."""
    from app.models.user import User, PlanType, RoleType

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
    from app.models.user import User, PlanType, RoleType

    async with TestSessionLocal() as db:
        user = User(
            email="admin@example.com",
            hashed_password=hash_password("adminpass"),
            name="Admin",
            plan=PlanType.pro,
            role=RoleType.admin,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        token = create_token(user.id)
        return {"Authorization": f"Bearer {token}"}

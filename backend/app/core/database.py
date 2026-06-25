from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


@lru_cache
def get_engine():
    """Create the async engine lazily on first use.

    The engine is NOT created at module import so that processes which never
    touch the database (e.g. a remote GPU transcription worker) can import this
    module — and everything that depends on it — without a configured
    ``DATABASE_URL``. ``create_async_engine`` does not connect on its own; a
    real connection is only opened on the first query.
    """
    settings = get_settings()
    return create_async_engine(
        settings.database_url,
        echo=False,
        echo_pool=settings.env == "development",
        pool_size=5,
        max_overflow=10,
        pool_recycle=1800,
        pool_pre_ping=True,
    )


@lru_cache
def get_session_maker() -> async_sessionmaker[AsyncSession]:
    """Create the session factory lazily (builds the engine on first call)."""
    return async_sessionmaker(get_engine(), class_=AsyncSession, expire_on_commit=False)


def __getattr__(name: str):
    """Backwards-compatible module-level access to ``engine`` / ``async_session``.

    Resolved lazily on first attribute access so importing the module has no
    side effects. Existing ``from app.core.database import async_session`` /
    ``import engine`` call sites keep working unchanged.
    """
    if name == "engine":
        return get_engine()
    if name == "async_session":
        return get_session_maker()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


async def get_db() -> AsyncSession:
    async with get_session_maker()() as session:
        try:
            yield session
        finally:
            await session.close()

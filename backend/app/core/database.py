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


async def commit_refresh(db: AsyncSession, *objs: object) -> None:
    """Commit the current transaction and refresh the given ORM instances.

    A thin wrapper around the extremely common ``await db.commit();
    await db.refresh(obj)`` pattern.  On commit failure the session is
    rolled back before re-raising so the caller never ends up in a
    dirty-session limbo.

    Args:
        db: The async session to commit.
        *objs: Zero or more ORM instances to refresh after commit.
            If none are given, only ``commit()`` is called.
    """
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    for obj in objs:
        await db.refresh(obj)

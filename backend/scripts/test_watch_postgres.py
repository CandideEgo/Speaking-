"""Create a disposable local database, run the insert-race tests, remove it."""

import asyncio
import os
import re
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncpg
import pytest
from sqlalchemy.engine import make_url

from app.core.config import get_settings


async def provision(name: str, *, drop: bool = False):
    url = make_url(get_settings().database_url)
    if url.host not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("Disposable watch tests require local PostgreSQL")
    if not re.fullmatch(r"seeword_watch_test_[0-9a-f]{12}", name):
        raise RuntimeError("Unexpected disposable database name")
    conn = await asyncpg.connect(
        host=url.host, port=url.port or 5432, user=url.username, password=url.password, database="postgres", timeout=5
    )
    try:
        if drop:
            await conn.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
        else:
            await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()
    return url.set(database=name).render_as_string(hide_password=False)


if __name__ == "__main__":
    name = "seeword_watch_test_" + uuid.uuid4().hex[:12]
    url = asyncio.run(provision(name))
    os.environ["PG_TEST_URL"] = url
    try:
        result = pytest.main(["tests/test_watch_progress_pg.py", "-q"])
    finally:
        asyncio.run(provision(name, drop=True))
    raise SystemExit(result)

"""Shared async event loop helper for Celery tasks.

Celery workers are synchronous — calling ``asyncio.run()`` inside each task
creates (and destroys) a brand-new event loop on every invocation, which is
wasteful and can conflict with libraries (like ``AsyncOpenAI``) that expect
loop persistence.

Instead, we maintain **one long-lived event loop per worker process** running
in a dedicated background thread.  Celery tasks submit coroutines to this loop
via ``asyncio.run_coroutine_threadsafe`` and block until the result is ready.
"""

import asyncio
import structlog
import threading
from concurrent.futures import Future
from typing import Coroutine, TypeVar

logger = structlog.get_logger()

T = TypeVar("T")

_loop: asyncio.AbstractEventLoop | None = None
_loop_thread: threading.Thread | None = None
_lock = threading.Lock()


def _ensure_loop() -> asyncio.AbstractEventLoop:
    """Lazily start a daemon-thread event loop (once per process)."""
    global _loop, _loop_thread
    if _loop is not None and _loop.is_running():
        return _loop

    with _lock:
        # Double-checked locking
        if _loop is not None and _loop.is_running():
            return _loop

        _loop = asyncio.new_event_loop()

        def _run():
            asyncio.set_event_loop(_loop)
            _loop.run_forever()

        _loop_thread = threading.Thread(target=_run, daemon=True, name="celery-asyncio")
        _loop_thread.start()

        logger.info("Started shared async event loop for Celery worker")
        return _loop


def run_async(coro: Coroutine[None, None, T]) -> T:
    """Run an async coroutine from synchronous Celery task code.

    Submits *coro* to the shared background event loop and blocks until
    the result (or exception) is available.  Reuses the same loop across
    calls, avoiding the ``asyncio.run()`` per-task anti-pattern.

    Usage::

        @celery_app.task
        def my_task(arg):
            result = run_async(_do_work(arg))
            return result

        async def _do_work(arg):
            ...
    """
    loop = _ensure_loop()
    future: Future[T] = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result()  # blocks until the coroutine completes

"""GPU worker security boundary: no database / OSS credentials in the environment.

Moved from ``backend/tests/test_pending_processing.py::TestGPUWorkerSecurity``
(that class is gone from the backend now that the GPU worker is its own
component). The guard itself lives in ``scripts/start_gpu_worker.py`` and exits
the process, so these tests run it in a subprocess and assert on the exit code
and stderr.

Why a subprocess instead of calling ``_security_guard`` in-process: the guard's
whole job is ``sys.exit(1)`` before any import of the worker, so the observable
contract is the process exit code — an in-process call with a patched
``sys.exit`` would assert the shape of the implementation, not the behaviour.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

GPU_WORKER_ROOT = Path(__file__).resolve().parents[1]

# Import through the ``scripts`` namespace package (no __init__.py needed on
# Python 3) and call the guard; ``__main__`` is never used, so the Celery worker
# is not started.
_GUARD_SCRIPT = "from scripts.start_gpu_worker import _security_guard; _security_guard()"

_FORBIDDEN_ENV = ("DATABASE_URL", "OSS_ACCESS_KEY", "OSS_SECRET_KEY")


def _run_guard(extra_env: dict[str, str]) -> subprocess.CompletedProcess:
    """Run the security guard with a clean env plus ``extra_env``."""
    env = os.environ.copy()
    for key in _FORBIDDEN_ENV:
        env.pop(key, None)
    env.update(extra_env)
    env["PYTHONUTF8"] = "1"
    return subprocess.run(
        [sys.executable, "-c", _GUARD_SCRIPT],
        cwd=GPU_WORKER_ROOT,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
    )


def test_database_url_is_rejected():
    """A DB credential means the worker could read user data — refuse to start."""
    result = _run_guard({"DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/seeword"})

    assert result.returncode == 1
    assert "SECURITY" in result.stderr
    assert "DATABASE_URL" in result.stderr


@pytest.mark.parametrize("oss_key", ["OSS_ACCESS_KEY", "OSS_SECRET_KEY"])
def test_oss_credentials_are_rejected(oss_key: str):
    """Object-storage credentials are equally out of bounds for this machine."""
    result = _run_guard({oss_key: "should-not-be-here"})

    assert result.returncode == 1
    assert "SECURITY" in result.stderr
    assert oss_key in result.stderr


def test_clean_environment_starts():
    """With none of the forbidden vars set the guard lets the process continue."""
    result = _run_guard({})

    assert result.returncode == 0, result.stderr
    assert result.stderr == ""

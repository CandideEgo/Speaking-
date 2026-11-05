"""Operator-owned local checkpoints; no DB, queue, credential or cost ledger.

Advisory OS lock is released on process death. A dispatched step without a
durable result remains uncertain; never resubmit it automatically.
"""

import copy
import json
import os
import sys
import tempfile
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from app.core.errors import AppError
from app.services import teaching_gateway
from app.services.teaching import content, qualification


def read_json(path: Path) -> dict:
    if path.stat().st_size > 1048576:
        raise AppError(422, "VALIDATION_ERROR", "核验文件超过 1 MiB 上限")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AppError(422, "VALIDATION_ERROR", "核验文件必须为 JSON 对象")
    return value


def _write(path: Path, value: dict) -> None:
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(value, handle, ensure_ascii=False, allow_nan=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


@contextmanager
def _locked(folder: Path):
    with (folder / ".lock").open("a+b") as handle:
        handle.seek(0, 2)
        if not handle.tell():
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            if sys.platform == "win32":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise AppError(409, "CONFLICT", "该核验目录正在被其他进程使用") from exc
        try:
            yield
        finally:
            if sys.platform == "win32":
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def prepare(path: Path, folder: Path, models: list[str]) -> dict:
    prepared = qualification.plan(read_json(path), models)
    # Exclusive new directory: never overwrite a prior job or its material.
    folder.mkdir(mode=0o700)
    job = {
        "plan": prepared,
        "plan_sha256": content.stable_hash(prepared),
        "steps": [{"status": "pending"} for _ in prepared["steps"]],
        "status": "prepared",
    }
    _write(folder / "job.json", job)
    return summary(job)


def _load(folder: Path) -> dict:
    job = read_json(folder / "job.json")
    prepared = job["plan"]
    expected = qualification.plan(prepared["candidate"], prepared["models"])
    if expected != prepared or content.stable_hash(prepared) != job["plan_sha256"] or len(job["steps"]) != 4:
        raise AppError(409, "CONTENT_REVISION_MISMATCH", "核验计划或材料发生变化，请创建新计划")
    if any(s.get("status") not in {"pending", "running", "uncertain", "succeeded"} for s in job["steps"]):
        raise AppError(422, "VALIDATION_ERROR", "未知核验步骤状态")
    return job


def summary(job: dict) -> dict:
    return {
        "status": job["status"],
        "steps": [{"index": i, "status": s["status"]} for i, s in enumerate(job["steps"])],
        "published": False,
    }


async def execute(folder: Path) -> dict:
    with _locked(folder):
        job = _load(folder)
        for saved in job["steps"]:
            if saved["status"] == "running":
                saved["status"] = "uncertain"
        if any(s["status"] == "uncertain" for s in job["steps"]):
            job["status"] = "uncertain"
            _write(folder / "job.json", job)
            return summary(job)
        # All checkpoints are reauthenticated before any new paid dispatch.
        for step, saved in zip(job["plan"]["steps"], job["steps"], strict=True):
            if saved["status"] == "succeeded":
                await qualification.authenticate_step(step, saved["receipt"])
                if not qualification.result_passes(job["plan"], step, saved["receipt"]):
                    job["status"] = "rejected"
                    _write(folder / "job.json", job)
                    return summary(job)
        if any(s["status"] == "pending" for s in job["steps"]):
            teaching_gateway.require_content_collection()
        for step, saved in zip(job["plan"]["steps"], job["steps"], strict=True):
            if saved["status"] == "succeeded":
                continue
            saved.update(status="running", dispatched_at=datetime.now(UTC).isoformat())
            job["status"] = "running"
            _write(folder / "job.json", job)
            try:
                receipt = await teaching_gateway.collect_content_receipt(step["kind"], copy.deepcopy(step["payload"]))
                await qualification.authenticate_step(step, receipt)
            except AppError as exc:
                saved.update(status="uncertain", error_code=exc.code)
                job["status"] = "uncertain"
                _write(folder / "job.json", job)
                return summary(job)
            saved.update(status="succeeded", receipt=receipt)
            _write(folder / "job.json", job)
            if not qualification.result_passes(job["plan"], step, receipt):
                job["status"] = "rejected"
                _write(folder / "job.json", job)
                return summary(job)
        try:
            manifest = await qualification.assemble(job["plan"], [s["receipt"] for s in job["steps"]])
        except AppError as exc:
            job.update(status="rejected", error_code=exc.code)
            _write(folder / "job.json", job)
            return summary(job)
        _write(folder / "manifest.json", manifest)
        job["status"] = "qualified"
        _write(folder / "job.json", job)
        return summary(job)


async def recover(folder: Path, index: int, path: Path) -> dict:
    """Recover an independently retrieved signed response, never a bool override."""
    with _locked(folder):
        job = _load(folder)
        if not 0 <= index < len(job["steps"]) or job["steps"][index]["status"] not in {"running", "uncertain"}:
            raise AppError(409, "CONFLICT", "只能恢复结果不确定的核验步骤")
        receipt = read_json(path)
        await qualification.authenticate_step(job["plan"]["steps"][index], receipt)
        job["steps"][index].update(status="succeeded", receipt=receipt, recovered_at=datetime.now(UTC).isoformat())
        job["status"] = "prepared"
        _write(folder / "job.json", job)
        return summary(job)

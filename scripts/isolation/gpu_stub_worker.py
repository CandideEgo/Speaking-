#!/usr/bin/env python3
"""A10 隔离演练用的 GPU 桩 worker。

只加载 Celery/kombu 与 `gpu_worker` 的纯配置模块，不加载 torch/whisperx 与任何
模型——它不是真实转录实现，只验证**权限边界**：GPU 身份能否正常消费、写心跳、
回调云端，以及越权命令是否被 Redis 服务端拒绝。

真实 GPU worker 的 broker 设置（私有 unacked 命名空间、忽略结果、关闭遥控）
来自同一个 [`gpu_worker/broker_settings.py`](../../gpu-worker/gpu_worker/broker_settings.py)，
所以这里跑通的 key 集合就是生产会用的集合。

由 `scripts/isolation/test_a10_gpu_acl.py` 启动；也可以手工跑：

    PYTHONUTF8=1 backend/.venv/Scripts/python.exe scripts/isolation/gpu_stub_worker.py \
        --redis-url redis://gpu:PASSWORD@127.0.0.1:16379/0 \
        --queue transcription_gpu \
        --callback-url http://127.0.0.1:18081/callback \
        --secret one-off-secret --work-seconds 0
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "gpu-worker"))

from celery import Celery
from celery.signals import worker_ready
from gpu_worker.broker_recovery import restore_orphaned_unacked
from gpu_worker.broker_settings import broker_transport_options
from gpu_worker.contracts import (
    CALLBACK_SECRET_HEADER,
    HEARTBEAT_INTERVAL_SECONDS,
    HEARTBEAT_KEY,
    HEARTBEAT_TTL_SECONDS,
    TASK_NAME,
)
from kombu import Queue


class StubArgs(argparse.Namespace):
    redis_url: str
    queue: str
    callback_url: str
    secret: str
    work_seconds: float
    visibility_timeout: float


def _post_callback(args: StubArgs, video_id: str) -> int | None:
    if not args.callback_url:
        return None
    payload = json.dumps(
        {
            "video_id": video_id,
            "status": "ok",
            "segments": [],
            "audio_duration": 1.0,
            "stub": True,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        args.callback_url,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json", CALLBACK_SECRET_HEADER: args.secret},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return int(response.status)


def build_app(args: StubArgs) -> Celery:
    app = Celery("gpu-stub", broker=args.redis_url, backend=args.redis_url)
    app.conf.update(
        # Same broker contract as the real GPU worker (A10/OPS-04).
        broker_transport_options={
            **broker_transport_options(),
            # Production keeps kombu's 3600s. T3 compresses it so a killed
            # worker's in-flight message becomes visible to the restarted
            # worker inside the drill window.
            "visibility_timeout": args.visibility_timeout,
        },
        task_ignore_result=True,
        worker_enable_remote_control=False,
        task_serializer="json",
        accept_content=["json"],
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        task_default_queue=args.queue,
        task_queues=(Queue(args.queue),),
        task_routes={TASK_NAME: {"queue": args.queue}},
        broker_connection_retry_on_startup=True,
    )

    @app.task(name=TASK_NAME, acks_late=True)
    def transcribe_video_stub(video_id: str, source: str = "", platform: str = "") -> None:
        print(f"TASK_START {video_id}", flush=True)
        if args.work_seconds:
            time.sleep(args.work_seconds)
        status = _post_callback(args, video_id)
        print(f"TASK_DONE {video_id} callback={status}", flush=True)

    return app


def _heartbeat(url: str, stop: threading.Event) -> None:
    import redis

    client = redis.from_url(url, decode_responses=True)
    while not stop.is_set():
        try:
            client.set(HEARTBEAT_KEY, "1", ex=HEARTBEAT_TTL_SECONDS)
        except Exception as exc:
            print(f"[heartbeat] failed: {exc}", file=sys.stderr, flush=True)
        stop.wait(HEARTBEAT_INTERVAL_SECONDS)
    try:
        client.delete(HEARTBEAT_KEY)
    except Exception:
        pass


@worker_ready.connect
def _announce_ready(**_kwargs) -> None:
    print("STUB_READY", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="GPU stub worker for the A10 isolation drill")
    parser.add_argument("--redis-url", required=True)
    parser.add_argument("--queue", default="transcription_gpu")
    parser.add_argument("--callback-url", default="")
    parser.add_argument("--secret", default="")
    parser.add_argument("--work-seconds", type=float, default=0.0)
    parser.add_argument("--visibility-timeout", type=float, default=3600.0)
    args = parser.parse_args(namespace=StubArgs())

    app = build_app(args)

    try:
        restored = restore_orphaned_unacked(args.redis_url, app.conf.broker_transport_options)
        print(f"STUB_RESTORED {restored}", flush=True)
    except Exception as exc:
        print(f"STUB_RESTORE_FAILED {exc}", flush=True)

    stop = threading.Event()
    thread = threading.Thread(target=_heartbeat, args=(args.redis_url, stop), daemon=True, name="gpu-heartbeat")
    thread.start()

    try:
        app.worker_main(
            argv=[
                "worker",
                "--loglevel=INFO",
                "--queues",
                args.queue,
                "--concurrency=1",
                # Windows: the prefork pool is unsupported; the real GPU
                # launcher also runs --pool=solo.
                "--pool=solo",
                "--without-gossip",
                "--without-mingle",
                "--without-heartbeat",
                "--hostname",
                f"gpu-stub@{os.getpid()}",
            ]
        )
    finally:
        stop.set()
    return 0


if __name__ == "__main__":
    sys.exit(main())

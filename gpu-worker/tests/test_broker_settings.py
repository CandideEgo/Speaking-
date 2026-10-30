"""A10/OPS-04：GPU 身份的 broker 命名空间（不加载 torch/whisperx）。

真实的 GPU worker 与隔离演练的桩 worker 共用 `gpu_worker.broker_settings`
的定义，所以这里断言的就是生产会生效的值，而不是演练脚本里的副本。
"""

import sys
import types

from gpu_worker.broker_settings import (
    UNACKED_INDEX_KEY,
    UNACKED_KEY,
    UNACKED_MUTEX_KEY,
    broker_transport_options,
)


def test_gpu_transport_keys_are_private_and_not_the_cloud_defaults() -> None:
    options = broker_transport_options()
    assert options == {
        "unacked_key": UNACKED_KEY,
        "unacked_index_key": UNACKED_INDEX_KEY,
        "unacked_mutex_key": UNACKED_MUTEX_KEY,
    }
    # The cloud (and kombu's defaults) use these unprefixed names; the GPU must
    # not share them, or an ACL key pattern cannot isolate in-flight messages.
    assert "unacked" not in options.values()
    assert "unacked_index" not in options.values()
    assert "unacked_mutex" not in options.values()


def test_celery_app_closes_result_and_remote_control_channels() -> None:
    # `gpu_worker.celery_app` imports `gpu_worker.tasks` for side effects, which
    # pulls in WhisperX/torch. Stub it out: this test only inspects app config.
    sys.modules.setdefault("gpu_worker.tasks", types.ModuleType("gpu_worker.tasks"))

    from gpu_worker.celery_app import celery_app

    assert celery_app.conf.broker_transport_options == broker_transport_options()
    # Results travel over the HTTP callback only — no `celery-task-meta-*` keys.
    assert celery_app.conf.task_ignore_result is True
    # No pidbox subscription: the GPU machine gets no control channel over the
    # cloud worker, and no pubsub permission in Redis.
    assert celery_app.conf.worker_enable_remote_control is False

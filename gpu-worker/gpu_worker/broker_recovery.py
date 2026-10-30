"""Restore orphaned in-flight GPU messages when the worker starts (A10/OPS-04).

Why this exists (measured in the A10 drill): kombu's visibility-based restore
(``QoS.restore_visible``) is invoked from the *synchronous* transport loop. A
Celery worker runs the async hub loop, which reads sockets directly and never
calls ``Transport.get`` → ``maybe_restore_messages``. So when the GPU worker is
hard-killed mid-transcription, its message stays in ``gpu_unacked`` forever
instead of being redelivered after ``visibility_timeout``.

At startup this process owns no in-flight messages, so every entry in its
private unacked namespace is an orphan from the previous process and can be put
back on its queue. The payload carries the exchange/routing key, so kombu's own
``restore_by_tag`` re-queues it exactly where it came from.

Deployment assumption: **one GPU worker per queue**. The machine runs
``--pool=solo`` with concurrency 1; a second live worker would have its own
in-flight messages restored by this call. Do not scale this worker
horizontally without revisiting this routine.
"""

from __future__ import annotations

from typing import Any

from gpu_worker.broker_settings import broker_transport_options


def restore_orphaned_unacked(redis_url: str, transport_options: dict[str, Any] | None = None) -> int:
    """Re-queue every entry of the GPU's private unacked namespace.

    Returns the number of delivery tags restored. Raises on connection/ACL
    errors — callers on the startup path should catch and log, because a Redis
    outage must not stop the worker from starting (it will retry next start).
    """
    from kombu import Connection

    options = transport_options or broker_transport_options()
    restored = 0
    with Connection(redis_url, transport_options=options, connect_timeout=5) as conn:
        channel = conn.default_channel
        tags = channel.client.zrange(channel.unacked_index_key, 0, -1)
        for tag in tags:
            channel.qos.restore_by_tag(tag, client=channel.client)
            restored += 1
    return restored

"""Broker transport settings shared by the GPU worker and the isolation stub.

The GPU machine gets its own Redis identity (A10/OPS-04), and that identity may
only touch its own keys. Kombu's Redis transport defaults to the **shared**
``unacked`` / ``unacked_index`` / ``unacked_mutex`` keys, which are also used by
the cloud worker's in-flight messages — no key-pattern ACL can separate them.
Renaming the three keys the transport uses gives the GPU identity a private
namespace; the ACL then allows exactly those names and nothing else.

This module is deliberately torch-free: the isolation stub worker and the pure
unit test import it without loading WhisperX. ``gpu_worker.celery_app`` imports
it for the real worker.
"""

#: Hash holding in-flight (unacked) message payloads for the GPU consumer.
UNACKED_KEY = "gpu_unacked"
#: Sorted set of unacked delivery tags (visibility timeout bookkeeping).
UNACKED_INDEX_KEY = "gpu_unacked_index"
#: Mutex key used when restoring visible unacked messages.
UNACKED_MUTEX_KEY = "gpu_unacked_mutex"


def broker_transport_options() -> dict[str, str]:
    """Transport options that keep the GPU's in-flight state out of the cloud's."""
    return {
        "unacked_key": UNACKED_KEY,
        "unacked_index_key": UNACKED_INDEX_KEY,
        "unacked_mutex_key": UNACKED_MUTEX_KEY,
    }

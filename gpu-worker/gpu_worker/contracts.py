"""Cross-machine contract constants shared with the cloud backend.

These values are the wire contract between the cloud (``backend/``) and this
GPU worker. They live in one module so ``gpu_worker.tasks`` and
``gpu_worker.celery_app`` can both use them without a circular import, and
``tests/test_contracts.py`` can pin them.

**Changing any of these breaks in-flight messages or the admin heartbeat
panel — they are compatibility constants, not tunables.**
"""

# Celery task name. Deliberately still the OLD name
# (``app.tasks.video_processing.transcribe_video_gpu``): the cloud enqueues
# tasks under that name, so renaming it would orphan every message already in
# the ``transcription_gpu`` queue (unregistered-task failures). The name is a
# contract, not a module path — this worker is no longer inside ``app``.
TASK_NAME = "app.tasks.video_processing.transcribe_video_gpu"

# Redis heartbeat key watched by the cloud admin panel ("Worker 在线/离线").
# Value is the literal string "1"; the TTL is what makes a dead worker show as
# offline (no explicit delete needed).
HEARTBEAT_KEY = "worker:gpu:heartbeat"
HEARTBEAT_INTERVAL_SECONDS = 60
HEARTBEAT_TTL_SECONDS = 90

# Header carrying the shared secret on the transcription callback POST.
CALLBACK_SECRET_HEADER = "X-Callback-Secret"

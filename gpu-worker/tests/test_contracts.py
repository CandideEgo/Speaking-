"""Pins the cross-machine contract with the cloud backend.

Everything asserted here is consumed by ``backend/`` or by the cloud admin
panel, so a change is a coordinated release, not a local refactor:

- the Celery task name the cloud enqueues (deliberately the OLD ``app.*`` dotted
  name even though this code lives in ``gpu_worker`` — in-flight messages in
  ``transcription_gpu`` outlive the move)
- the queue the worker consumes / the task is routed to
- the Redis heartbeat key + timing the admin panel reads
- the callback header name
- the ``platform`` enum values carried in the task message
"""

from gpu_worker.celery_app import celery_app
from gpu_worker.config import Settings, get_settings
from gpu_worker.contracts import (
    CALLBACK_SECRET_HEADER,
    HEARTBEAT_INTERVAL_SECONDS,
    HEARTBEAT_KEY,
    HEARTBEAT_TTL_SECONDS,
    TASK_NAME,
)
from gpu_worker.sources import VideoSource


class TestTaskName:
    def test_task_name_matches_cloud_enqueue_name(self):
        # Literal, not just a round-trip through the constant: editing
        # contracts.py alone must not silently move the queue's task name.
        assert TASK_NAME == "app.tasks.video_processing.transcribe_video_gpu"

    def test_tasks_module_reexports_the_contract_name(self):
        from gpu_worker import tasks

        assert tasks.TASK_NAME == TASK_NAME

    def test_task_registered_under_the_contract_name(self):
        assert TASK_NAME in celery_app.tasks


class TestQueueRouting:
    def test_default_queue_name_contract(self):
        # The field default is the literal the cloud's celery_app must match.
        assert Settings.model_fields["transcription_gpu_queue_name"].default == "transcription_gpu"

    def test_worker_consumes_only_the_gpu_queue(self):
        settings = get_settings()
        assert celery_app.conf.task_default_queue == settings.transcription_gpu_queue_name
        assert {q.name for q in celery_app.conf.task_queues} == {settings.transcription_gpu_queue_name}

    def test_task_routed_to_gpu_queue(self):
        settings = get_settings()
        assert celery_app.conf.task_routes[TASK_NAME]["queue"] == settings.transcription_gpu_queue_name


class TestHeartbeat:
    def test_heartbeat_key_is_the_admin_panel_key(self):
        assert HEARTBEAT_KEY == "worker:gpu:heartbeat"

    def test_heartbeat_interval_and_ttl(self):
        # 60s beat / 90s TTL: the TTL must outlive two missed beats so a single
        # transient Redis blip doesn't flap the admin panel to "offline".
        assert HEARTBEAT_INTERVAL_SECONDS == 60
        assert HEARTBEAT_TTL_SECONDS == 90


class TestCallbackContract:
    def test_secret_header_name(self):
        assert CALLBACK_SECRET_HEADER == "X-Callback-Secret"


class TestVideoSourceEnum:
    def test_values_match_backend_enum(self):
        # backend/app/models/video.py::VideoSource is the source of truth; the
        # platform value in the task message must round-trip through both.
        assert {source.value for source in VideoSource} == {"local", "imported"}
        assert VideoSource("local") is VideoSource.local
        assert VideoSource("imported") is VideoSource.imported

"""Video source enum — copied from ``backend/app/models/video.py::VideoSource``.

The GPU worker never imports SQLAlchemy models (no database, no ORM in this
deployable), but the transcription pipeline needs the same enum values to
decide how to fetch audio (local file vs. imported URL). The string values are
part of the task-message contract: the cloud enqueues ``platform`` as
``"local"`` or ``"imported"``.

Keep in sync with the backend enum — it is the source of truth.
"""

import enum


class VideoSource(str, enum.Enum):
    local = "local"
    imported = "imported"

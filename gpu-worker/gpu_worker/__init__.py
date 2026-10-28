"""SeeWord GPU transcription worker — a standalone Celery worker.

Extracted from ``backend/`` so it can run on the desktop machine that owns the
GPU (RTX 3060 Ti) while the rest of SeeWord moves to a laptop. It consumes the
``transcription_gpu`` queue only, has no database / OSS credentials, and
delivers results back to the cloud over the HTTP callback contract described in
``README.md``.
"""

__version__ = "0.1.0"

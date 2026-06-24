"""Alibaba Cloud OSS upload service.

Gracefully degrades: if OSS is not enabled or credentials are missing,
all methods return empty string / False without raising.

Uses the oss2 Python SDK for uploads. Large files (>10 MB) use resumable
(multipart) upload for reliability.
"""

from pathlib import Path

import structlog

from app.core.config import get_settings

logger = structlog.get_logger()

# Size threshold for resumable (multipart) upload — 10 MB
_RESUMABLE_THRESHOLD = 10 * 1024 * 1024

# Content-Type mapping for common media extensions
_CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".vtt": "text/vtt",
    ".srt": "text/plain",
}


def _is_configured() -> bool:
    """Return True if all required OSS settings are present and upload is enabled."""
    s = get_settings()
    return bool(s.oss_upload_enabled and s.oss_endpoint and s.oss_bucket and s.oss_access_key and s.oss_secret_key)


def _get_bucket():
    """Instantiate and return an oss2.Bucket object.

    Only call this after checking _is_configured().
    """
    import oss2

    s = get_settings()
    auth = oss2.Auth(s.oss_access_key, s.oss_secret_key)
    endpoint = s.oss_endpoint
    # Ensure endpoint has scheme
    if not endpoint.startswith("http"):
        endpoint = f"https://{endpoint}"
    return oss2.Bucket(auth, endpoint, s.oss_bucket)


def _content_type_for(path: str) -> str:
    """Determine Content-Type from file extension."""
    ext = Path(path).suffix.lower()
    return _CONTENT_TYPES.get(ext, "application/octet-stream")


def _object_key(remote_key: str) -> str:
    """Prepend the configured prefix to the remote key."""
    s = get_settings()
    prefix = s.oss_prefix
    if prefix and not prefix.endswith("/"):
        prefix += "/"
    # Avoid double slash
    if remote_key.startswith("/"):
        remote_key = remote_key[1:]
    return f"{prefix}{remote_key}"


async def upload_file(local_path: str, remote_key: str) -> str:
    """Upload a local file to OSS and return its CDN URL.

    If OSS is not configured, returns an empty string.
    On upload failure, logs a warning and returns an empty string.
    """
    if not _is_configured():
        return ""

    import asyncio

    source = Path(local_path)
    if not source.exists():
        logger.error("OSS upload: local file not found", local_path=local_path)
        return ""

    key = _object_key(remote_key)
    content_type = _content_type_for(local_path)
    file_size = source.stat().st_size

    def _sync_upload():
        import oss2  # imported lazily so the app runs without the SDK installed

        bucket = _get_bucket()
        if file_size > _RESUMABLE_THRESHOLD:
            # Resumable (multipart) upload for large files
            oss2.resumable_upload(
                bucket,
                key,
                local_path,
                store=oss2.ResumableStore(root="/tmp"),
                multipart_threshold=_RESUMABLE_THRESHOLD,
                part_size=4 * 1024 * 1024,  # 4 MB per part
                num_threads=4,
                headers={"Content-Type": content_type},
            )
        else:
            bucket.put_object_from_file(
                key,
                local_path,
                headers={"Content-Type": content_type},
            )
        return _get_cdn_url(key)

    try:
        loop = asyncio.get_running_loop()
        cdn_url = await loop.run_in_executor(None, _sync_upload)
        logger.info(
            "OSS upload succeeded",
            key=key,
            cdn_url=cdn_url,
            size_mb=round(file_size / (1024 * 1024), 2),
        )
        return cdn_url
    except Exception:
        logger.exception("OSS upload failed", local_path=local_path, key=key)
        return ""


async def delete_file(remote_key: str) -> bool:
    """Delete a file from OSS. Returns True on success, False otherwise."""
    if not _is_configured():
        return False

    import asyncio

    key = _object_key(remote_key)

    def _sync_delete():
        bucket = _get_bucket()
        bucket.delete_object(key)
        return True

    try:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _sync_delete)
    except Exception:
        logger.exception("OSS delete failed", key=key)
        return False


def _get_cdn_url(key: str) -> str:
    """Construct a CDN URL from an object key.

    If oss_cdn_domain is set, uses that; otherwise falls back to the
    standard OSS bucket URL.
    """
    s = get_settings()
    if s.oss_cdn_domain:
        domain = s.oss_cdn_domain
        if not domain.startswith("http"):
            domain = f"https://{domain}"
        return f"{domain}/{key}"
    # Fallback: standard OSS URL
    endpoint = s.oss_endpoint
    if not endpoint.startswith("http"):
        endpoint = f"https://{endpoint}"
    return f"{endpoint}/{s.oss_bucket}/{key}"

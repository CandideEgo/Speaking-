"""External (YouTube) metadata parsing — 阶段 1 of the video feature plan.

Pure mapping from a yt-dlp ``extract_info(download=False)`` dict onto the
Video external-metadata columns + the ``external_meta`` JSON blob. Shared by
the pipeline's extracting step (``video_processing._extract_video_info``) and
``scripts/backfill_external_meta.py`` so both write identical shapes.

``ext_view_count`` / ``ext_like_count`` are the YouTube-side counts — strictly
separated from the in-app ``Video.view_count`` completion counter.
"""

from __future__ import annotations

from datetime import UTC, datetime


def _parse_upload_date(raw: str | None) -> datetime | None:
    """yt-dlp upload_date is ``YYYYMMDD`` (UTC, no time component)."""
    if not raw or len(raw) != 8 or not raw.isdigit():
        return None
    try:
        return datetime(int(raw[:4]), int(raw[4:6]), int(raw[6:8]), tzinfo=UTC)
    except ValueError:
        return None


def _caption_summary(info: dict) -> dict:
    """Summarize caption tracks: counts + whether English tracks exist.

    yt-dlp shape: ``info["subtitles"]`` = manual tracks, ``info["automatic_captions"]``
    = ASR tracks; both map language code → list of format dicts.
    """
    manual = info.get("subtitles") or {}
    auto = info.get("automatic_captions") or {}
    manual_langs = {k for k, v in manual.items() if v}
    auto_langs = {k for k, v in auto.items() if v}
    return {
        "has_caption": bool(manual_langs or auto_langs),
        "manual_count": len(manual_langs),
        "auto_count": len(auto_langs),
        "has_manual_en": "en" in manual_langs,
        "has_auto_en": "en" in auto_langs,
    }


def parse_external_meta(info: dict) -> dict:
    """Map a yt-dlp info dict onto Video external-metadata fields.

    Returns a dict with the column fields (``yt_video_id``, ``channel_id``,
    ``channel_name``, ``upload_date``, ``ext_view_count``, ``ext_like_count``)
    plus ``external_meta`` — the JSON blob for non-queried extras
    (description/tags/categories/language/captions/channel stats/fetched_at).
    Missing values become None; never raises on partial dicts.
    """
    channel_name = info.get("channel") or info.get("uploader")
    channel_meta: dict = {}
    if info.get("channel_follower_count") is not None:
        channel_meta["follower_count"] = info["channel_follower_count"]
    if info.get("channel_view_count") is not None:
        channel_meta["total_view_count"] = info["channel_view_count"]
    if info.get("channel_is_verified") is not None:
        channel_meta["is_verified"] = info["channel_is_verified"]

    external_meta: dict = {
        "description": info.get("description"),
        "tags": info.get("tags") or [],
        "categories": info.get("categories") or [],
        "language": info.get("language"),
        "captions": _caption_summary(info),
        "channel": channel_meta,
        "fetched_at": datetime.now(UTC).isoformat(),
    }

    return {
        "yt_video_id": info.get("id"),
        "channel_id": info.get("channel_id"),
        "channel_name": channel_name,
        "upload_date": _parse_upload_date(info.get("upload_date")),
        "ext_view_count": info.get("view_count"),
        "ext_like_count": info.get("like_count"),
        "external_meta": external_meta,
    }


def apply_external_meta(video, parsed: dict) -> None:
    """Write ``parse_external_meta`` output onto a Video instance (in-place)."""
    video.yt_video_id = parsed.get("yt_video_id")
    video.channel_id = parsed.get("channel_id")
    video.channel_name = parsed.get("channel_name")
    video.upload_date = parsed.get("upload_date")
    video.ext_view_count = parsed.get("ext_view_count")
    video.ext_like_count = parsed.get("ext_like_count")
    video.external_meta = parsed.get("external_meta")

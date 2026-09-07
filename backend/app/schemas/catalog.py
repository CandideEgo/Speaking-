"""Schemas for the catalog candidate pool (admin curation staging area)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


def _dt_to_iso(v: object) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


class CatalogItemResponse(BaseModel):
    """One catalog candidate as seen by the admin panel.

    ``status`` is the catalog's own recorded lifecycle; ``effective_status`` /
    ``promoted_video_*`` are derived live from the promoted ``Video`` so the
    admin sees real pipeline truth without a reconcile beat task.
    """

    id: str
    source: str
    upstream_id: str
    source_url: str
    title: str
    channel_id: str | None = None
    channel_name: str | None = None
    ext_view_count: int | None = None
    duration_sec: int | None = None
    publish_date: str | None = None
    thumbnail_url: str | None = None
    subs_available: bool = False
    freq_rank95: int | None = None
    popularity_score: int | None = None
    fit_score: float | None = None
    status: str
    # Derived (read-only) — populated by the service from the promoted Video.
    effective_status: str | None = None
    promoted_video_id: str | None = None
    promoted_video_status: str | None = None
    promoted_video_published: bool | None = None
    admin_notes: str | None = None
    created_at: str
    promoted_at: str | None = None
    published_at: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("publish_date", "created_at", "promoted_at", "published_at", mode="before")
    @classmethod
    def _serialize_dt(cls, v: object) -> str | None:
        return _dt_to_iso(v)


class CatalogPromoteRequest(BaseModel):
    """Promote a catalog candidate into the official-video ingestion pipeline.

    MVP promotes via the existing full pipeline (``seed_video`` ->
    ``process_video``: extract -> transcribe -> translate -> annotate ->
    yt-dlp download + ffmpeg transcode -> publish). ``auto_publish`` mirrors the
    one-click ``/videos/seed-full`` behaviour: publish automatically once ready.
    """

    auto_publish: bool = True


class CatalogMarkRequest(BaseModel):
    """Admin curation mark that does NOT trigger processing."""

    # new (reset) | queued (next-up) | skipped (rejected candidate)
    status: str
    admin_notes: str | None = None

    @field_validator("status")
    @classmethod
    def _check_status(cls, v: str) -> str:
        allowed = {"new", "queued", "skipped"}
        if v not in allowed:
            raise ValueError(f"status must be one of {sorted(allowed)}")
        return v


class CatalogSummaryResponse(BaseModel):
    total: int
    by_status: dict[str, int]
    by_source: dict[str, int]


class CatalogImportResult(BaseModel):
    source: str
    imported: int
    updated: int
    skipped: int
    total: int

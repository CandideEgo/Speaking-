"""Tests for the catalog candidate pool (staging + promote-one-publish-one)."""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from sqlalchemy import select

from app.models.catalog import CatalogItem, CatalogStatus
from app.models.video import Video, VideoReviewStatus, VideoSource, VideoStatus
from app.services import catalog_service


async def _make_item(db, **kw) -> CatalogItem:
    defaults = dict(
        source="languagereactor",
        upstream_id=kw.pop("upstream_id", None) or f"yt_{uuid.uuid4().hex[:10]}",
        source_url="https://www.youtube.com/watch?v=test",
        title="Test Candidate",
        channel_id="UCtest",
        channel_name="Test Channel",
        ext_view_count=50000,
        duration_sec=300,
        subs_available=True,
        freq_rank95=5000,
        fit_score=65.0,
        status=CatalogStatus.new.value,
    )
    defaults.update(kw)
    item = CatalogItem(**defaults)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def _make_video(db, *, ready=True, published=False, status=None, source_url=None) -> Video:
    video = Video(
        title="Promoted Video",
        source_url=source_url or "https://www.youtube.com/watch?v=promoted",
        video_source=VideoSource.imported,
        status=status or (VideoStatus.ready if ready else VideoStatus.processing),
        review_status=VideoReviewStatus.published.value if published else VideoReviewStatus.draft.value,
        is_official=True,
        is_published=published,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)
    return video


# ---------------------------------------------------------------------------
# Service: fit score + import
# ---------------------------------------------------------------------------


def test_compute_fit_score_prefers_learning_suitable():
    good = catalog_service.compute_fit_score(
        duration_sec=300, subs_available=True, freq_rank95=5000, ext_view_count=50000
    )
    bad = catalog_service.compute_fit_score(duration_sec=20, subs_available=False, freq_rank95=99000, ext_view_count=10)
    assert good > bad
    assert 0 <= bad <= 100
    assert good <= 100


async def test_import_records_is_idempotent(db_session):
    records = [
        {
            "upstream_id": "aaa111",
            "source_url": "https://www.youtube.com/watch?v=aaa111",
            "title": "First",
            "channel_name": "ChanA",
            "ext_view_count": 10000,
            "duration_sec": 240,
            "subs_available": True,
            "freq_rank95": 4000,
        },
        {
            "upstream_id": "bbb222",
            "source_url": "https://www.youtube.com/watch?v=bbb222",
            "title": "Second",
            "duration_sec": 600,
            "subs_available": True,
        },
    ]
    r1 = await catalog_service.import_records(db_session, records, source="languagereactor")
    assert r1["imported"] == 2
    assert r1["updated"] == 0

    # Re-import: no duplicates, metadata refreshed, fit_score computed.
    records[0]["title"] = "First (updated)"
    r2 = await catalog_service.import_records(db_session, records, source="languagereactor")
    assert r2["imported"] == 0
    assert r2["updated"] == 2

    summary = await catalog_service.summary(db_session)
    assert summary["total"] == 2
    assert summary["by_status"].get("new") == 2


async def test_import_records_skips_incomplete(db_session):
    records = [
        {"upstream_id": None, "source_url": "https://x"},  # missing id
        {"upstream_id": "ccc333", "source_url": None},  # missing url
        {"upstream_id": "ddd444", "source_url": "https://www.youtube.com/watch?v=ddd444", "title": "ok"},
    ]
    r = await catalog_service.import_records(db_session, records, source="languagereactor")
    assert r["imported"] == 1
    assert r["skipped"] == 2


# ---------------------------------------------------------------------------
# API: auth + list + filters
# ---------------------------------------------------------------------------


async def test_list_catalog_requires_admin(client):
    resp = await client.get("/api/v1/admin/catalog")
    assert resp.status_code in (401, 403)


async def test_list_catalog_sorted_by_fit_and_paginated(client, admin_headers, db_session):
    await _make_item(db_session, fit_score=10.0, title="low fit")
    await _make_item(db_session, fit_score=90.0, title="high fit")
    await _make_item(db_session, fit_score=50.0, title="mid fit")

    resp = await client.get("/api/v1/admin/catalog?page=1&page_size=2&sort=fit", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert data["has_more"] is True
    titles = [i["title"] for i in data["items"]]
    assert titles == ["high fit", "mid fit"]


async def test_list_catalog_filters(client, admin_headers, db_session):
    await _make_item(db_session, title="Apple Pie", channel_name="Cooking", duration_sec=300, status="new")
    await _make_item(db_session, title="Banana Split", channel_name="Cooking", duration_sec=60, status="new")
    await _make_item(db_session, title="News Today", channel_name="NewsCo", duration_sec=900, status="skipped")

    # keyword
    r = await client.get("/api/v1/admin/catalog?keyword=apple", headers=admin_headers)
    assert r.status_code == 200 and r.json()["total"] == 1
    # channel
    r = await client.get("/api/v1/admin/catalog?channel=Cooking", headers=admin_headers)
    assert r.json()["total"] == 2
    # status
    r = await client.get("/api/v1/admin/catalog?status=skipped", headers=admin_headers)
    assert r.json()["total"] == 1
    # min duration
    r = await client.get("/api/v1/admin/catalog?min_duration=120", headers=admin_headers)
    assert r.json()["total"] == 2


async def test_catalog_summary(client, admin_headers, db_session):
    await _make_item(db_session, status="new")
    await _make_item(db_session, status="new")
    await _make_item(db_session, status="skipped")
    resp = await client.get("/api/v1/admin/catalog/summary", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert data["by_status"]["new"] == 2
    assert data["by_status"]["skipped"] == 1
    assert data["by_source"]["languagereactor"] == 3


async def test_get_catalog_item_and_404(client, admin_headers, db_session):
    item = await _make_item(db_session)
    ok = await client.get(f"/api/v1/admin/catalog/{item.id}", headers=admin_headers)
    assert ok.status_code == 200
    assert ok.json()["id"] == item.id
    missing = await client.get(f"/api/v1/admin/catalog/{uuid.uuid4()}", headers=admin_headers)
    assert missing.status_code == 404


# ---------------------------------------------------------------------------
# API: mark
# ---------------------------------------------------------------------------


async def test_mark_item_transitions(client, admin_headers, db_session):
    item = await _make_item(db_session, status="new")
    r = await client.patch(f"/api/v1/admin/catalog/{item.id}", json={"status": "queued"}, headers=admin_headers)
    assert r.status_code == 200 and r.json()["status"] == "queued"
    r = await client.patch(
        f"/api/v1/admin/catalog/{item.id}",
        json={"status": "skipped", "admin_notes": "not suitable"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "skipped"
    assert r.json()["admin_notes"] == "not suitable"


async def test_mark_item_invalid_status_422(client, admin_headers, db_session):
    item = await _make_item(db_session)
    r = await client.patch(f"/api/v1/admin/catalog/{item.id}", json={"status": "bogus"}, headers=admin_headers)
    assert r.status_code == 422


async def test_mark_item_cannot_reset_processing(client, admin_headers, db_session):
    item = await _make_item(db_session, status="processing")
    r = await client.patch(f"/api/v1/admin/catalog/{item.id}", json={"status": "new"}, headers=admin_headers)
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# API: promote (reuses video_seed_service.seed_video)
# ---------------------------------------------------------------------------


async def test_promote_item_starts_pipeline(client, admin_headers, db_session):
    item = await _make_item(db_session, status="new")
    video = await _make_video(db_session, ready=False, published=False)
    stub = SimpleNamespace(id=video.id, is_published=False)

    with patch("app.services.video_seed_service.seed_video", new=AsyncMock(return_value=stub)) as mock_seed:
        r = await client.post(
            f"/api/v1/admin/catalog/{item.id}/promote", json={"auto_publish": True}, headers=admin_headers
        )
    assert r.status_code == 200, r.text
    mock_seed.assert_awaited_once()
    data = r.json()
    assert data["status"] == "processing"
    assert data["promoted_video_id"] == video.id
    assert data["promoted_at"] is not None


async def test_promote_published_video_marks_published(client, admin_headers, db_session):
    item = await _make_item(db_session, status="new")
    video = await _make_video(db_session, ready=True, published=True)
    stub = SimpleNamespace(id=video.id, is_published=True)

    with patch("app.services.video_seed_service.seed_video", new=AsyncMock(return_value=stub)):
        r = await client.post(f"/api/v1/admin/catalog/{item.id}/promote", json={}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "published"
    assert r.json()["published_at"] is not None


async def test_promote_already_published_400(client, admin_headers, db_session):
    item = await _make_item(db_session, status="published")
    r = await client.post(f"/api/v1/admin/catalog/{item.id}/promote", json={}, headers=admin_headers)
    assert r.status_code == 400


async def test_effective_status_reflects_promoted_video(client, admin_headers, db_session):
    video = await _make_video(db_session, ready=True, published=True)
    item = await _make_item(db_session, status="processing", promoted_video_id=video.id)
    r = await client.get(f"/api/v1/admin/catalog/{item.id}", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["effective_status"] == "published"
    assert data["promoted_video_published"] is True
    assert data["promoted_video_status"] == "ready"


# ---------------------------------------------------------------------------
# API: promote re-entry (must not duplicate the Video row / the GPU run)
# ---------------------------------------------------------------------------


async def test_repromote_reuses_existing_processing_video(client, admin_headers, db_session):
    """Re-promoting a mid-pipeline item reuses its video instead of re-seeding."""
    url = "https://www.youtube.com/watch?v=dup-while-processing"
    video = await _make_video(db_session, ready=False, source_url=url)
    item = await _make_item(db_session, status="processing", source_url=url, promoted_video_id=video.id)

    with patch(
        "app.services.video_seed_service.seed_video",
        new=AsyncMock(side_effect=AssertionError("re-promote must not re-seed")),
    ) as mock_seed:
        r = await client.post(f"/api/v1/admin/catalog/{item.id}/promote", json={}, headers=admin_headers)

    assert r.status_code == 200, r.text
    mock_seed.assert_not_awaited()
    data = r.json()
    assert data["promoted_video_id"] == video.id
    assert data["status"] == "processing"

    videos = (await db_session.execute(select(Video).where(Video.source_url == url))).scalars().all()
    assert len(videos) == 1

    # Stored status read back through a fresh request session.
    stored = await client.get(f"/api/v1/admin/catalog/{item.id}", headers=admin_headers)
    assert stored.json()["status"] == CatalogStatus.processing.value


async def test_repromote_existing_published_video_keeps_bookkeeping(client, admin_headers, db_session):
    """Reuse branch still records the published status + published_at."""
    url = "https://www.youtube.com/watch?v=dup-published"
    video = await _make_video(db_session, ready=True, published=True, source_url=url)
    item = await _make_item(db_session, status="processing", source_url=url, promoted_video_id=video.id)

    with patch(
        "app.services.video_seed_service.seed_video",
        new=AsyncMock(side_effect=AssertionError("re-promote must not re-seed")),
    ) as mock_seed:
        r = await client.post(f"/api/v1/admin/catalog/{item.id}/promote", json={}, headers=admin_headers)

    assert r.status_code == 200, r.text
    mock_seed.assert_not_awaited()
    data = r.json()
    assert data["status"] == "published"
    assert data["published_at"] is not None
    assert data["promoted_video_id"] == video.id

    videos = (await db_session.execute(select(Video).where(Video.source_url == url))).scalars().all()
    assert len(videos) == 1

    stored = await client.get(f"/api/v1/admin/catalog/{item.id}", headers=admin_headers)
    assert stored.json()["status"] == CatalogStatus.published.value


async def test_repromote_ready_unpublished_video_stays_processing(client, admin_headers, db_session):
    """A ready-but-unpublished video is reused and leaves the item in processing."""
    url = "https://www.youtube.com/watch?v=dup-ready-unpublished"
    video = await _make_video(db_session, ready=True, published=False, source_url=url)
    item = await _make_item(db_session, status="processing", source_url=url, promoted_video_id=video.id)

    with patch(
        "app.services.video_seed_service.seed_video",
        new=AsyncMock(side_effect=AssertionError("re-promote must not re-seed")),
    ) as mock_seed:
        r = await client.post(f"/api/v1/admin/catalog/{item.id}/promote", json={}, headers=admin_headers)

    assert r.status_code == 200, r.text
    mock_seed.assert_not_awaited()
    data = r.json()
    assert data["status"] == "processing"
    assert data["published_at"] is None
    assert data["promoted_video_id"] == video.id

    videos = (await db_session.execute(select(Video).where(Video.source_url == url))).scalars().all()
    assert len(videos) == 1


async def test_repromote_errored_video_reseeds(client, admin_headers, db_session):
    """An errored video is the legitimate retry path — it must re-seed."""
    url = "https://www.youtube.com/watch?v=errored-then-retried"
    errored = await _make_video(db_session, status=VideoStatus.error, source_url=url)
    item = await _make_item(db_session, status="processing", source_url=url, promoted_video_id=errored.id)
    new_video = await _make_video(db_session, ready=False, source_url="https://www.youtube.com/watch?v=promoted-new")
    stub = SimpleNamespace(id=new_video.id, is_published=False)

    with patch("app.services.video_seed_service.seed_video", new=AsyncMock(return_value=stub)) as mock_seed:
        r = await client.post(f"/api/v1/admin/catalog/{item.id}/promote", json={}, headers=admin_headers)

    assert r.status_code == 200, r.text
    mock_seed.assert_awaited_once()
    data = r.json()
    assert data["promoted_video_id"] == new_video.id
    assert data["status"] == "processing"


async def test_promote_adopts_official_video_for_same_url(client, admin_headers, db_session):
    """URL-scoped reuse: an in-flight official video for the URL is adopted.

    The item records no ``promoted_video_id`` (it is a first promote, or its
    recorded video errored) while an official ``Video(processing)`` already
    exists for the same ``source_url`` — the state a concurrent first promote
    leaves behind, since ``seed_video`` commits its video before
    ``promote_item`` records the link. Re-seeding here would duplicate the row
    and the GPU run.
    """
    url = "https://www.youtube.com/watch?v=in-flight-for-url"
    video = await _make_video(db_session, ready=False, source_url=url)
    item = await _make_item(db_session, status="new", source_url=url)

    with patch(
        "app.services.video_seed_service.seed_video",
        new=AsyncMock(side_effect=AssertionError("must not re-seed")),
    ) as mock_seed:
        r = await client.post(f"/api/v1/admin/catalog/{item.id}/promote", json={}, headers=admin_headers)

    assert r.status_code == 200, r.text
    mock_seed.assert_not_awaited()
    data = r.json()
    assert data["promoted_video_id"] == video.id
    assert data["status"] == "processing"

    videos = (await db_session.execute(select(Video).where(Video.source_url == url))).scalars().all()
    assert len(videos) == 1

"""Tests for subtitle reorder / create / delete endpoints (canvas editor MVP).

reorder: reassign sentence_index for all subtitles in one transaction; timing
    re-validated against the new neighbor order.
create: append a new row at the end; timing must not overlap.
delete: remove one row and close the gap in sentence_index.
"""

import pytest
from httpx import AsyncClient

from app.models.subtitle import Subtitle
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal


async def _seed(subtitles: list[dict]) -> tuple[str, list[str]]:
    async with TestSessionLocal() as db:
        v = Video(
            title="ReorderCreateDelete",
            source_url="https://youtu.be/rcd",
            video_source=VideoSource.imported,
            status=VideoStatus.ready,
            is_official=True,
        )
        db.add(v)
        await db.flush()
        subs = []
        for i, s in enumerate(subtitles):
            sub = Subtitle(
                video_id=v.id,
                start_time=s["start"],
                end_time=s["end"],
                text_en=s["text"],
                text_zh=s.get("zh"),
                # Allow the test to seed a scrambled index (default = loop order).
                sentence_index=s.get("index", i),
            )
            db.add(sub)
            subs.append(sub)
        await db.commit()
        return v.id, [s.id for s in subs]


# --- reorder -----------------------------------------------------------------


@pytest.mark.asyncio
async def test_reorder_repairs_scrambled_indices(client: AsyncClient, admin_headers: dict):
    # Seed three subtitles in time order but with scrambled sentence_index.
    # Times: A(0-2) < B(2-4) < C(4-6); correct index order is A=0, B=1, C=2.
    vid, sids = await _seed(
        [
            {"start": 0.0, "end": 2.0, "text": "first", "index": 2},  # A
            {"start": 2.0, "end": 4.0, "text": "second", "index": 0},  # B
            {"start": 4.0, "end": 6.0, "text": "third", "index": 1},  # C
        ]
    )
    # Reorder so the index matches the time order (monotonic -> no overlap).
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/reorder",
        headers=admin_headers,
        json={
            "items": [
                {"id": sids[0], "sentence_index": 0},  # A
                {"id": sids[1], "sentence_index": 1},  # B
                {"id": sids[2], "sentence_index": 2},  # C
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    ordered = resp.json()
    assert [s["sentence_index"] for s in ordered] == [0, 1, 2]
    assert [s["text_en"] for s in ordered] == ["first", "second", "third"]

    async with TestSessionLocal() as db:
        for new_idx, sid in enumerate(sids):
            sub = await db.get(Subtitle, sid)
            assert sub.sentence_index == new_idx


@pytest.mark.asyncio
async def test_reorder_rejects_incomplete_payload(client: AsyncClient, admin_headers: dict):
    vid, sids = await _seed(
        [
            {"start": 0.0, "end": 2.0, "text": "first"},
            {"start": 2.0, "end": 4.0, "text": "second"},
        ]
    )
    # Only one of two subtitles included.
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/reorder",
        headers=admin_headers,
        json={"items": [{"id": sids[0], "sentence_index": 0}]},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_reorder_rejects_non_contiguous_indices(client: AsyncClient, admin_headers: dict):
    vid, sids = await _seed(
        [
            {"start": 0.0, "end": 2.0, "text": "first"},
            {"start": 2.0, "end": 4.0, "text": "second"},
        ]
    )
    # Indices 0 and 5 - gap, out of range.
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/reorder",
        headers=admin_headers,
        json={
            "items": [
                {"id": sids[0], "sentence_index": 0},
                {"id": sids[1], "sentence_index": 5},
            ]
        },
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_reorder_rejects_timing_overlap_in_new_order(client: AsyncClient, admin_headers: dict):
    # Two subtitles with overlapping time ranges - they happen not to overlap
    # only because of the neighbor check against the *current* order. Reverse
    # them so the later-starting one comes first, creating an overlap.
    vid, sids = await _seed(
        [
            {"start": 0.0, "end": 5.0, "text": "long first"},
            {"start": 3.0, "end": 6.0, "text": "overlapping second"},
        ]
    )
    # Place the second (start 3.0) before the first (start 0.0). In the new
    # order, "first" (0.0-5.0) is the next neighbor of "second" (3.0-6.0):
    # second.start(3.0) < first.end(5.0) -> overlap.
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/reorder",
        headers=admin_headers,
        json={
            "items": [
                {"id": sids[1], "sentence_index": 0},
                {"id": sids[0], "sentence_index": 1},
            ]
        },
    )
    assert resp.status_code == 400


# --- create ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_appends_subtitle_at_end(client: AsyncClient, admin_headers: dict):
    vid, _ = await _seed(
        [
            {"start": 0.0, "end": 2.0, "text": "first"},
            {"start": 2.0, "end": 4.0, "text": "second"},
        ]
    )
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles",
        headers=admin_headers,
        json={"start_time": 4.0, "end_time": 6.0, "text_en": "third"},
    )
    assert resp.status_code == 200, resp.text
    created = resp.json()
    assert created["sentence_index"] == 2
    assert created["text_en"] == "third"
    assert created["start_time"] == 4.0
    assert created["end_time"] == 6.0


@pytest.mark.asyncio
async def test_create_allows_empty_text_placeholder(client: AsyncClient, admin_headers: dict):
    vid, _ = await _seed([{"start": 0.0, "end": 2.0, "text": "first"}])
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles",
        headers=admin_headers,
        json={"start_time": 2.0, "end_time": 4.0, "text_en": ""},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["text_en"] == ""


@pytest.mark.asyncio
async def test_create_rejects_overlap(client: AsyncClient, admin_headers: dict):
    vid, _ = await _seed([{"start": 0.0, "end": 5.0, "text": "first"}])
    # New row starts before the existing one ends.
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles",
        headers=admin_headers,
        json={"start_time": 3.0, "end_time": 6.0, "text_en": "overlap"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_rejects_invalid_timing(client: AsyncClient, admin_headers: dict):
    vid, _ = await _seed([{"start": 0.0, "end": 2.0, "text": "first"}])
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles",
        headers=admin_headers,
        json={"start_time": 5.0, "end_time": 5.0, "text_en": "zero duration"},
    )
    assert resp.status_code == 422  # schema validator (start < end)


# --- delete ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_middle_closes_gap(client: AsyncClient, admin_headers: dict):
    vid, sids = await _seed(
        [
            {"start": 0.0, "end": 2.0, "text": "first"},
            {"start": 2.0, "end": 4.0, "text": "second"},
            {"start": 4.0, "end": 6.0, "text": "third"},
        ]
    )
    resp = await client.delete(
        f"/api/v1/videos/admin/{vid}/subtitles/{sids[1]}",
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["deleted_id"] == sids[1]
    assert body["remaining_count"] == 2

    async with TestSessionLocal() as db:
        assert await db.get(Subtitle, sids[1]) is None
        first = await db.get(Subtitle, sids[0])
        third = await db.get(Subtitle, sids[2])
        assert first.sentence_index == 0
        # Third shifted down from 2 -> 1.
        assert third.sentence_index == 1


@pytest.mark.asyncio
async def test_delete_not_found(client: AsyncClient, admin_headers: dict):
    vid, _ = await _seed([{"start": 0.0, "end": 2.0, "text": "first"}])
    resp = await client.delete(
        f"/api/v1/videos/admin/{vid}/subtitles/nonexistent-id",
        headers=admin_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_cross_video_rejected(client: AsyncClient, admin_headers: dict):
    vid, _ = await _seed([{"start": 0.0, "end": 2.0, "text": "first"}])
    _, sids2 = await _seed([{"start": 0.0, "end": 2.0, "text": "other video"}])
    # Try to delete vid2's subtitle via vid1's path.
    resp = await client.delete(
        f"/api/v1/videos/admin/{vid}/subtitles/{sids2[0]}",
        headers=admin_headers,
    )
    assert resp.status_code == 400

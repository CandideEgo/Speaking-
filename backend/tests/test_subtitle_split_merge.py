"""Tests for subtitle split/merge endpoints.

split: one subtitle becomes two at a split_time; word timestamps partitioned;
subsequent sentence_index shifted up.
merge: a subtitle absorbs the next one; the next row deleted; subsequent
sentence_index shifted down.
"""

import pytest
from httpx import AsyncClient

from app.models.subtitle import Subtitle
from app.models.video import Video, VideoSource, VideoStatus
from tests.conftest import TestSessionLocal


async def _seed(subtitles: list[dict]) -> tuple[str, list[str]]:
    async with TestSessionLocal() as db:
        v = Video(
            title="SplitMerge",
            source_url="https://youtu.be/splitmerge",
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
                sentence_index=i,
                words=s.get("words"),
            )
            db.add(sub)
            subs.append(sub)
        await db.commit()
        return v.id, [s.id for s in subs]


@pytest.mark.asyncio
async def test_split_creates_two_parts_and_shifts_index(client: AsyncClient, admin_headers: dict):
    vid, sids = await _seed(
        [
            {"start": 0.0, "end": 4.0, "text": "hello world there", "zh": "你好世界那里"},
            {"start": 4.0, "end": 8.0, "text": "second line", "zh": "第二行"},
        ]
    )
    # Split subtitle 0 at t=2.0
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/{sids[0]}/split",
        headers=admin_headers,
        json={"split_time": 2.0, "text_before": "hello world", "text_after": "there"},
    )
    assert resp.status_code == 200, resp.text
    parts = resp.json()
    assert len(parts) == 2
    before, after = parts
    assert before["text_en"] == "hello world"
    assert before["start_time"] == 0.0
    assert before["end_time"] == 2.0
    assert after["text_en"] == "there"
    assert after["start_time"] == 2.0
    assert after["end_time"] == 4.0

    # The second original subtitle's sentence_index shifted from 1 → 2.
    async with TestSessionLocal() as db:
        second = await db.get(Subtitle, sids[1])
        assert second.sentence_index == 2


@pytest.mark.asyncio
async def test_split_partitions_words(client: AsyncClient, admin_headers: dict):
    vid, sids = await _seed(
        [
            {
                "start": 0.0,
                "end": 4.0,
                "text": "hello there friend",
                "words": [
                    {"word": "hello", "start": 0.0, "end": 1.0},
                    {"word": "there", "start": 1.5, "end": 2.0},
                    {"word": "friend", "start": 2.5, "end": 3.5},
                ],
            }
        ]
    )
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/{sids[0]}/split",
        headers=admin_headers,
        json={"split_time": 2.2, "text_before": "hello there", "text_after": "friend"},
    )
    assert resp.status_code == 200, resp.text
    before, after = resp.json()
    # words with start < 2.2 → before; rest → after
    assert len(before["words"]) == 2
    assert before["words"][0]["word"] == "hello"
    assert len(after["words"]) == 1
    assert after["words"][0]["word"] == "friend"


@pytest.mark.asyncio
async def test_split_time_out_of_range_rejected(client: AsyncClient, admin_headers: dict):
    vid, sids = await _seed([{"start": 0.0, "end": 4.0, "text": "hello world"}])
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/{sids[0]}/split",
        headers=admin_headers,
        json={"split_time": 99.0, "text_before": "hello", "text_after": "world"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_merge_combines_with_next_and_shifts_index(client: AsyncClient, admin_headers: dict):
    vid, sids = await _seed(
        [
            {"start": 0.0, "end": 2.0, "text": "hello world", "zh": "你好"},
            {"start": 2.0, "end": 4.0, "text": "running fast", "zh": "跑得快"},
            {"start": 4.0, "end": 6.0, "text": "third line", "zh": "第三行"},
        ]
    )
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/{sids[0]}/merge",
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    merged = resp.json()
    assert merged["text_en"] == "hello world running fast"
    assert merged["start_time"] == 0.0
    assert merged["end_time"] == 4.0
    assert merged["text_zh"] == "你好 跑得快"

    # The merged-away row is deleted; the third row shifts down from index 2 → 1.
    async with TestSessionLocal() as db:
        assert await db.get(Subtitle, sids[1]) is None
        third = await db.get(Subtitle, sids[2])
        assert third.sentence_index == 1


@pytest.mark.asyncio
async def test_merge_last_subtitle_rejected(client: AsyncClient, admin_headers: dict):
    vid, sids = await _seed(
        [
            {"start": 0.0, "end": 2.0, "text": "only one"},
        ]
    )
    resp = await client.post(
        f"/api/v1/videos/admin/{vid}/subtitles/{sids[0]}/merge",
        headers=admin_headers,
    )
    assert resp.status_code == 400

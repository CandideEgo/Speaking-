"""Tests for admin quality-inspection endpoints (阶段 5)."""

import pytest
from httpx import AsyncClient

from app.models.video import Video, VideoStatus
from app.models.video_quality_report import VideoQualityReport
from tests.conftest import TestSessionLocal


class TestAdminQualityFilter:
    """GET /admin?quality=... filters by quality_flag / low coverage."""

    async def test_filter_quality_blocked(self, client: AsyncClient, admin_headers: dict):
        async with TestSessionLocal() as db:
            db.add(
                Video(
                    id="vb1",
                    title="blocked",
                    source_url="x",
                    status=VideoStatus.error,
                    quality_flag="quality_blocked",
                    is_official=True,
                    is_published=False,
                )
            )
            db.add(
                Video(
                    id="vw1",
                    title="warning",
                    source_url="x",
                    status=VideoStatus.ready,
                    quality_flag="quality_warning",
                    is_official=True,
                    is_published=False,
                )
            )
            db.add(
                Video(
                    id="vo1",
                    title="ok",
                    source_url="x",
                    status=VideoStatus.ready,
                    quality_flag=None,
                    is_official=True,
                    is_published=False,
                )
            )
            await db.commit()

        resp = await client.get("/api/v1/videos/admin?quality=quality_blocked", headers=admin_headers)
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()["items"]]
        assert "vb1" in ids
        assert "vw1" not in ids
        assert "vo1" not in ids

    async def test_filter_low_coverage(self, client: AsyncClient, admin_headers: dict):
        async with TestSessionLocal() as db:
            db.add(
                Video(
                    id="vlow",
                    title="low",
                    source_url="x",
                    status=VideoStatus.ready,
                    is_official=True,
                    is_published=False,
                )
            )
            db.add(
                Video(
                    id="vhigh",
                    title="high",
                    source_url="x",
                    status=VideoStatus.ready,
                    is_official=True,
                    is_published=False,
                )
            )
            await db.flush()
            db.add(
                VideoQualityReport(
                    video_id="vlow",
                    stage="translation",
                    passed=False,
                    coverage_ratio=0.5,
                    metrics={},
                    issues=[],
                )
            )
            db.add(
                VideoQualityReport(
                    video_id="vhigh",
                    stage="translation",
                    passed=True,
                    coverage_ratio=0.95,
                    metrics={},
                    issues=[],
                )
            )
            await db.commit()

        resp = await client.get("/api/v1/videos/admin?quality=low_coverage", headers=admin_headers)
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()["items"]]
        assert "vlow" in ids
        assert "vhigh" not in ids

    async def test_admin_response_includes_quality_flag(self, client: AsyncClient, admin_headers: dict):
        async with TestSessionLocal() as db:
            db.add(
                Video(
                    id="vflag",
                    title="flagged",
                    source_url="x",
                    status=VideoStatus.ready,
                    quality_flag="quality_warning",
                    is_official=True,
                    is_published=False,
                )
            )
            await db.commit()

        resp = await client.get("/api/v1/videos/admin?quality=quality_warning", headers=admin_headers)
        item = resp.json()["items"][0]
        assert item["quality_flag"] == "quality_warning"


class TestQualityReportsEndpoint:
    """GET /admin/{id}/quality-reports returns the report history."""

    async def test_returns_reports_newest_first(self, client: AsyncClient, admin_headers: dict):
        async with TestSessionLocal() as db:
            db.add(
                Video(
                    id="vqr",
                    title="q",
                    source_url="x",
                    status=VideoStatus.ready,
                    is_official=True,
                    is_published=False,
                )
            )
            await db.flush()
            db.add(
                VideoQualityReport(
                    video_id="vqr",
                    stage="translation",
                    passed=False,
                    coverage_ratio=0.5,
                    metrics={"coverage_ratio": 0.5, "translated_count": 2, "total_subtitles": 4},
                    issues=["Coverage 50% < 80% (2/4 translated)"],
                )
            )
            db.add(
                VideoQualityReport(
                    video_id="vqr",
                    stage="transcription",
                    passed=True,
                    coverage_ratio=None,
                    metrics={"checks": [], "warnings": []},
                    issues=[],
                    segment_count=10,
                )
            )
            await db.commit()

        resp = await client.get("/api/v1/videos/admin/vqr/quality-reports", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        stages = [r["stage"] for r in data]
        assert "translation" in stages
        assert "transcription" in stages
        # find the translation report and verify fields
        tr = next(r for r in data if r["stage"] == "translation")
        assert tr["passed"] is False
        assert tr["coverage_ratio"] == 0.5
        assert len(tr["issues"]) == 1

    async def test_requires_admin(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/videos/admin/any/quality-reports", headers=auth_headers)
        assert resp.status_code == 403

    async def test_empty_for_video_without_reports(self, client: AsyncClient, admin_headers: dict):
        async with TestSessionLocal() as db:
            db.add(
                Video(
                    id="vempty",
                    title="empty",
                    source_url="x",
                    status=VideoStatus.ready,
                    is_official=True,
                    is_published=False,
                )
            )
            await db.commit()

        resp = await client.get("/api/v1/videos/admin/vempty/quality-reports", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json() == []

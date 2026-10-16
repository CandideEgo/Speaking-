"""原卷 PDF 下载：登录门 + 路径安全。

``data/exam_pdfs/`` 不进 git、不进 CI（``backend/data/`` 被两处 ignore），所以
CI 里清单是空的 —— 正向路径用临时目录 + 伪造清单，401/404 这类安全路径不依赖数据。
"""

import json
from types import SimpleNamespace

import pytest

from app.services import exam_pdf_service


def _write_catalog(root, records):
    (root / "files").mkdir(parents=True, exist_ok=True)
    for rec in records:
        if rec["rel_path"].startswith("files/"):
            (root / rec["rel_path"]).write_bytes(b"%PDF-1.4 fake")
    (root / "index.json").write_text(
        json.dumps({"count": len(records), "papers": records}, ensure_ascii=False), encoding="utf-8"
    )


@pytest.fixture
def fake_pdfs(tmp_path, monkeypatch):
    """把 service 的清单根指到临时目录，并清掉 lru_cache。"""
    root = tmp_path / "exam_pdfs"
    _write_catalog(
        root,
        [
            {
                "slug": "cet4-2014-06-1",
                "title": "2014年6月四级真题（第1套）",
                "subject": "cet4",
                "year": 2014,
                "month": 6,
                "set_no": 1,
                "bytes": 12,
                "sha256": "x" * 64,
                "rel_path": "files/cet4-2014-06-1.pdf",
            },
            {
                "slug": "tem8-2020",
                "title": "2020年专八真题",
                "subject": "tem8",
                "year": 2020,
                "month": None,
                "set_no": 1,
                "bytes": 12,
                "sha256": "y" * 64,
                "rel_path": "files/tem8-2020.pdf",
            },
        ],
    )
    monkeypatch.setattr(exam_pdf_service, "get_settings", lambda: SimpleNamespace(exam_pdf_dir=str(root)))
    exam_pdf_service._catalog.cache_clear()
    yield root
    exam_pdf_service._catalog.cache_clear()


async def test_anonymous_download_requires_login(client):
    resp = await client.get("/api/v1/exam-pdfs/cet4-2014-06-1/file")
    assert resp.status_code == 401


async def test_anonymous_list_requires_login(client):
    resp = await client.get("/api/v1/exam-pdfs")
    assert resp.status_code == 401


async def test_download_serves_attachment(client, auth_headers, fake_pdfs):
    resp = await client.get("/api/v1/exam-pdfs/cet4-2014-06-1/file", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment" in resp.headers["content-disposition"]
    # 中文标题走 RFC 5987，不能是裸露的非 ASCII。
    assert "filename*=utf-8''" in resp.headers["content-disposition"]
    assert resp.content.startswith(b"%PDF")


async def test_download_accepts_query_token(client, auth_headers, fake_pdfs):
    """``<a download>`` 发不出请求头，所以必须支持 ?token=。"""
    token = auth_headers["Authorization"].split(" ", 1)[1]
    resp = await client.get(f"/api/v1/exam-pdfs/cet4-2014-06-1/file?token={token}")
    assert resp.status_code == 200


async def test_unknown_slug_is_404(client, auth_headers, fake_pdfs):
    resp = await client.get("/api/v1/exam-pdfs/nope/file", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.parametrize("slug", ["..%2f..%2fetc%2fpasswd", "..", "%2e%2e%2fsecret"])
async def test_traversal_slug_is_404(client, auth_headers, fake_pdfs, slug):
    """slug 从不出现在路径拼接里 —— 只在清单里查表，查不到就是 404。"""
    resp = await client.get(f"/api/v1/exam-pdfs/{slug}/file", headers=auth_headers)
    assert resp.status_code == 404


def test_catalog_rel_path_cannot_escape_root(tmp_path, monkeypatch):
    """清单本身被改坏（rel_path 带 ..）也不读出去 —— 双保险的第二道。"""
    root = tmp_path / "exam_pdfs"
    _write_catalog(
        root,
        [
            {
                "slug": "evil",
                "title": "evil",
                "subject": "cet4",
                "year": 2020,
                "month": None,
                "set_no": 1,
                "bytes": 1,
                "sha256": "z" * 64,
                "rel_path": "../secret.pdf",
            }
        ],
    )
    (tmp_path / "secret.pdf").write_bytes(b"top secret")
    monkeypatch.setattr(exam_pdf_service, "get_settings", lambda: SimpleNamespace(exam_pdf_dir=str(root)))
    exam_pdf_service._catalog.cache_clear()
    try:
        assert exam_pdf_service.resolve("evil") is None
    finally:
        exam_pdf_service._catalog.cache_clear()


def test_list_filters_by_subject_and_sorts(fake_pdfs):
    assert [p["slug"] for p in exam_pdf_service.list_pdfs()] == ["tem8-2020", "cet4-2014-06-1"]
    assert [p["slug"] for p in exam_pdf_service.list_pdfs("cet4")] == ["cet4-2014-06-1"]
    assert exam_pdf_service.list_pdfs("ky1") == []


def test_missing_catalog_is_empty_not_crash(tmp_path, monkeypatch):
    monkeypatch.setattr(exam_pdf_service, "get_settings", lambda: SimpleNamespace(exam_pdf_dir=str(tmp_path / "nope")))
    exam_pdf_service._catalog.cache_clear()
    try:
        assert exam_pdf_service.list_pdfs() == []
        assert exam_pdf_service.resolve("cet4-2014-06-1") is None
    finally:
        exam_pdf_service._catalog.cache_clear()

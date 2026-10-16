"""真题原卷 PDF 的清单服务（登录用户即可下载，无 Pro 门控）。

清单与文件由 ``backend/scripts/build_exam_pdf_index.py`` 生成，落在
``settings.exam_pdf_dir``（``data/exam_pdfs/``）：``index.json`` + ``files/<slug>.pdf``。
生产是只读 bind mount，所以这里只读。

**客户端永远拿不到路径。** API 只收 ``slug``，路径从清单里查出来，再经
``resolve().relative_to(root)`` 兜一道 —— 对照 ``api/v1/media.py`` 那处真实发生过的
``..`` 绕过（那里 ``file_path`` 来自客户端，只能每请求校验）。
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _catalog() -> tuple[Path, dict[str, dict]]:
    """(根目录, slug -> 记录)。清单缺失时返回空表，让 API 体面地报空而不是 500。"""
    root = Path(get_settings().exam_pdf_dir)
    index_path = root / "index.json"
    if not index_path.is_file():
        logger.warning("真题 PDF 清单不存在：%s（未同步 data/exam_pdfs/？）", index_path)
        return root, {}
    data = json.loads(index_path.read_text(encoding="utf-8"))
    return root, {r["slug"]: r for r in data.get("papers", [])}


def list_pdfs(subject: str | None = None) -> list[dict]:
    """清单（可只取某个科目）。字段刻意不含 sha256 —— 那是同步时校验用的。"""
    _root, by_slug = _catalog()
    items = [
        {
            "slug": r["slug"],
            "title": r["title"],
            "subject": r["subject"],
            "year": r["year"],
            "month": r["month"],
            "set_no": r["set_no"],
            "bytes": r["bytes"],
        }
        for r in by_slug.values()
    ]
    if subject:
        items = [i for i in items if i["subject"] == subject]
    items.sort(key=lambda i: (-i["year"], -(i["month"] or 0), i["set_no"]))
    return items


def resolve(slug: str) -> tuple[Path, dict] | None:
    """slug → (盘上绝对路径, 记录)。slug 不存在或文件缺失/越界一律 None。"""
    root, by_slug = _catalog()
    rec = by_slug.get(slug)
    if rec is None:
        return None
    root = root.resolve()
    try:
        full = (root / rec["rel_path"]).resolve()
        full.relative_to(root)  # 双保险：清单被改坏也不会读出去
    except ValueError:
        logger.error("真题 PDF 路径越界：slug=%s rel_path=%s", slug, rec["rel_path"])
        return None
    if not full.is_file():
        logger.warning("真题 PDF 缺失：%s（清单说在 %s）", slug, rec["rel_path"])
        return None
    return full, rec

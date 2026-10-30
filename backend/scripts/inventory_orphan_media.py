#!/usr/bin/env python
"""只读盘点媒体目录里的孤儿文件（A08/BE-04）。

对照数据库里所有已知引用（头像、视频封面/清晰度、导出 ZIP、按用户目录归属的
历史跟读录音），列出：没有引用方的孤儿文件、引用了但磁盘缺失的悬空引用、
以及已在 ``media_cleanup_tasks`` 排队等待删除的路径。

**本脚本只读**：不删除、不移动任何文件。存量孤儿按审计要求先盘点，清理另行
执行（带备份与确认）。退役功能的 ``shadowing/<user_id>/`` 只在该用户仍存在时
算「有主」；已注销用户留下的目录会显示为孤儿。

用法（在 backend/ 下）：

    PYTHONUTF8=1 .venv/Scripts/python.exe scripts/inventory_orphan_media.py
    PYTHONUTF8=1 .venv/Scripts/python.exe scripts/inventory_orphan_media.py --json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import defaultdict
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select

import app.models  # noqa: F401  (fill Base.metadata / relationships)
from app.core.config import get_settings
from app.core.database import async_session
from app.models.data_export import DataExportTask
from app.models.media_cleanup import MediaCleanupTask
from app.models.user import User
from app.models.video import Video


def _root() -> Path:
    return Path(get_settings().local_media_path).resolve()


def _rel(path: Path, root: Path) -> str | None:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return None


def _from_url(url: str | None) -> str | None:
    if not url or not url.startswith("/media/"):
        return None
    return url[len("/media/") :].strip("/")


async def collect() -> dict:
    root = _root()
    referenced: dict[str, str] = {}
    dangling: list[dict] = []
    users: set[str] = set()
    video_ids: set[str] = set()

    async with async_session() as db:
        for user in (await db.execute(select(User))).scalars().all():
            users.add(user.id)
            rel = _from_url(user.avatar_url)
            if rel:
                referenced[rel] = "users.avatar_url"
                if not (root / rel).is_file():
                    dangling.append({"path": rel, "source": "users.avatar_url", "user_id": user.id})

        for video in (await db.execute(select(Video))).scalars().all():
            video_ids.add(video.id)
            for attr in ("thumbnail_url", "video_url_480p", "video_url_720p", "video_url_1080p"):
                rel = _from_url(getattr(video, attr))
                if rel:
                    referenced[rel] = f"videos.{attr}"
                    if not (root / rel).is_file():
                        dangling.append({"path": rel, "source": f"videos.{attr}", "video_id": video.id})

        for task in (await db.execute(select(DataExportTask))).scalars().all():
            if task.file_path:
                rel = Path(task.file_path).as_posix()
                referenced[rel] = "data_export_tasks.file_path"
                if not (root / rel).is_file():
                    dangling.append({"path": rel, "source": "data_export_tasks.file_path", "task_id": task.id})

        scheduled = {
            row.path: row.kind
            for row in (await db.execute(select(MediaCleanupTask).where(MediaCleanupTask.status == "pending")))
            .scalars()
            .all()
        }

    # Retired shadowing audio is account-owned only while the account exists.
    for user_id in users:
        shadow = root / "shadowing" / user_id
        if shadow.is_dir():
            for path in shadow.rglob("*"):
                if path.is_file():
                    rel = _rel(path, root)
                    if rel:
                        referenced[rel] = "shadowing/<user_id>"

    # Video processing writes raw/transcoded files named after the video id;
    # those are platform files, not orphans, as long as the row exists.
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = _rel(path, root)
        if rel is None:
            continue
        name = path.name
        # Files are named <video_id>_raw.mp4 / <video_id>_720p.mp4 / <video_id>.mp4;
        # the id has no underscores, so the first token is the id when it matches.
        if name.split("_", 1)[0] in video_ids or path.stem in video_ids:
            referenced.setdefault(rel, "videos.<id>_*")
        if rel.startswith("shadowing/"):
            # Covered above when the directory belongs to a live user.
            continue

    orphan: list[dict] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = _rel(path, root)
        if rel is None or rel in referenced or rel in scheduled:
            continue
        stat = path.stat()
        orphan.append({"path": rel, "size_bytes": stat.st_size})

    by_top: dict[str, dict[str, int]] = defaultdict(lambda: {"files": 0, "bytes": 0})
    for item in orphan:
        top = item["path"].split("/", 1)[0] if "/" in item["path"] else "<root>"
        by_top[top]["files"] += 1
        by_top[top]["bytes"] += item["size_bytes"]

    return {
        "media_root": str(root),
        "referenced_files": len(referenced),
        "scheduled_files": len(scheduled),
        "orphan_files": len(orphan),
        "orphan_bytes": sum(item["size_bytes"] for item in orphan),
        "orphans_by_top_dir": dict(sorted(by_top.items())),
        "dangling_references": dangling,
        "scheduled_paths": sorted(scheduled),
        "sample_orphans": sorted(orphan, key=lambda item: item["size_bytes"], reverse=True)[:20],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only orphan media inventory (A08)")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--out", default="", help="write the JSON report to this path")
    args = parser.parse_args()

    report = asyncio.run(collect())
    if args.out:
        Path(args.out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    print(f"media_root: {report['media_root']}")
    print(f"referenced_files: {report['referenced_files']}")
    print(f"scheduled_for_deletion: {report['scheduled_files']}")
    print(f"orphan_files: {report['orphan_files']}  orphan_bytes: {report['orphan_bytes']}")
    print(f"dangling_references: {len(report['dangling_references'])}")
    for top, stats in report["orphans_by_top_dir"].items():
        print(f"  {top}: {stats['files']} files, {stats['bytes']} bytes")
    for item in report["sample_orphans"]:
        print(f"  orphan {item['path']} ({item['size_bytes']} bytes)")
    # Read-only by design: this script never deletes anything.
    return 0


if __name__ == "__main__":
    sys.exit(main())

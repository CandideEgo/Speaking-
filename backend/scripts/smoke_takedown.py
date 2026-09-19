"""E2E smoke: 内容三态与半自动下线（需求 §5.1 / §5.3）。

Drive the takedown flow over real HTTP against the ASGI app on a temp SQLite
file plus a temp media dir:
  建议下线候选 → 管理员确认下线 → 列表/排行隐藏 → 媒体释放
  → 收藏夹保留入口并标注已下架 → 学习记录不断链

Run: PYTHONUTF8=1 .venv/Scripts/python.exe scripts/smoke_takedown.py
"""

import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_TMP = tempfile.mkdtemp(prefix="seeword-takedown-")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{os.path.join(_TMP, 'smoke.db')}"
os.environ["LOCAL_MEDIA_PATH"] = os.path.join(_TMP, "media")
os.environ.setdefault("SECRET_KEY", "smoke-secret-key-long-enough-for-hs256")

from datetime import UTC, datetime, timedelta
from pathlib import Path

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import Base, get_async_session_maker, get_engine
from app.core.security import create_token
from app.main import app
from app.models.favorite import UserFavorite
from app.models.learning import Vocabulary
from app.models.subtitle import Subtitle
from app.models.user import RoleType, User
from app.models.video import Video, VideoStatus


def check(label: str, ok: bool, detail: str = "") -> bool:
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")
    return ok


async def main() -> int:
    results: list[bool] = []

    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    media_dir = Path(get_settings().local_media_path).resolve()
    media_dir.mkdir(parents=True, exist_ok=True)

    async with get_async_session_maker()() as db:
        user = User(
            phone="13900000021",
            hashed_password="x",
            role=RoleType.user,
            onboarding_completed=True,
        )
        admin = User(phone="13900000022", hashed_password="x", role=RoleType.admin)
        db.add_all([user, admin])
        await db.flush()

        # 冷门老视频（应进「建议下线」）
        old_created = datetime.now(UTC) - timedelta(days=90)
        cold = Video(
            title="冷门老视频",
            source_url="https://example.com/cold",
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
            created_at=old_created,
            published_at=old_created,
            view_count=5,
            favorite_count=1,
        )
        # 热门老视频（不应进建议）
        hot = Video(
            title="热门老视频",
            source_url="https://example.com/hot",
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
            created_at=old_created,
            published_at=old_created,
            view_count=5000,
            favorite_count=300,
        )
        db.add_all([cold, hot])
        await db.flush()

        for v in (cold, hot):
            v.video_url_720p = f"/media/{v.id}_720p.mp4"
            v.thumbnail_url = f"/media/{v.id}_thumb.jpg"
        db.add(
            Subtitle(
                video_id=cold.id,
                start_time=0.0,
                end_time=2.0,
                text_en="Takedown lifecycle",
                text_zh="下线生命周期",
                sentence_index=0,
                word_levels={"lifecycle": ["cet4"]},
            )
        )
        db.add(UserFavorite(user_id=user.id, video_id=cold.id))
        db.add(Vocabulary(user_id=user.id, word="lifecycle", video_id=cold.id, mastery_level="mastered"))
        await db.commit()
        user_id, admin_id, cold_id, hot_id = user.id, admin.id, cold.id, hot.id

    # 落媒体文件（含缩略图）
    files = {
        "720": media_dir / f"{cold_id}_720p.mp4",
        "bare": media_dir / f"{cold_id}.mp4",
        "raw": media_dir / f"{cold_id}_raw.mp4",
        "thumb": media_dir / f"{cold_id}_thumb.jpg",
    }
    for p in files.values():
        p.write_bytes(b"media payload")

    user_headers = {"Authorization": f"Bearer {create_token(user_id)}"}
    admin_headers = {"Authorization": f"Bearer {create_token(admin_id)}"}
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://smoke") as c:
        print("\n[1] 半自动：阈值建议候选")
        r = await c.get("/api/v1/videos/admin/takedown-suggestions", headers=admin_headers)
        results.append(check("200", r.status_code == 200, f"status={r.status_code}"))
        ids = [i["id"] for i in r.json()["items"]]
        results.append(check("冷门老视频入选", cold_id in ids, str(ids)))
        results.append(check("热门视频不入选", hot_id not in ids))
        r = await c.get("/api/v1/videos/admin/takedown-suggestions", headers=user_headers)
        results.append(check("普通用户 403", r.status_code == 403, f"status={r.status_code}"))

        print("\n[2] 下线前：可见 + 可播")
        feed = (await c.get("/api/v1/browse/feed?page=1&page_size=50")).json()
        results.append(check("feed 可见", any(i["id"] == cold_id for i in feed["items"])))
        r = await c.get(f"/media/{cold_id}_720p.mp4?token={create_token(user_id)}")
        results.append(check("媒体可播 200", r.status_code == 200, f"status={r.status_code}"))

        print("\n[3] 管理员确认下线")
        r = await c.post(f"/api/v1/videos/admin/{cold_id}/takedown", headers=admin_headers)
        results.append(check("200", r.status_code == 200, f"status={r.status_code}"))
        body = r.json()
        results.append(check("storage_mode=offline", body["storage_mode"] == "offline", str(body["storage_mode"])))
        results.append(check("is_published=False", body["is_published"] is False))

        print("\n[4] 下线后：列表与排行自动隐藏")
        feed = (await c.get("/api/v1/browse/feed?page=1&page_size=50")).json()
        results.append(check("feed 已隐藏", not any(i["id"] == cold_id for i in feed["items"])))
        latest = (await c.get("/api/v1/videos/rankings?scope=latest")).json()
        results.append(check("排行已隐藏（无需新过滤）", not any(i["id"] == cold_id for i in latest)))

        print("\n[5] 媒体释放（缩略图保留）")
        results.append(check("720p 已删", not files["720"].exists()))
        results.append(check("裸 mp4 已删", not files["bare"].exists()))
        results.append(check("raw 已删", not files["raw"].exists()))
        results.append(check("缩略图保留（收藏夹仍要渲染）", files["thumb"].exists()))
        r = await c.get(f"/media/{cold_id}_720p.mp4?token={create_token(user_id)}")
        results.append(check("普通用户媒体不可读", r.status_code in (403, 404), f"status={r.status_code}"))

        print("\n[6] 收藏夹保留入口并标注已下架（§5.3）")
        favs = (await c.get("/api/v1/videos/favorites", headers=user_headers)).json()
        item = next((i for i in favs["items"] if i["id"] == cold_id), None)
        results.append(check("仍在收藏夹", item is not None))
        results.append(
            check(
                "带已下架标注",
                item is not None and item["storage_mode"] == "offline",
                str(item and item["storage_mode"]),
            )
        )

        print("\n[7] 学习记录不断链（字幕/词行保留，仅不可播）")
        detail = (await c.get(f"/api/v1/videos/{cold_id}", headers=user_headers)).json()
        results.append(check("详情返回 offline", detail["storage_mode"] == "offline"))
        results.append(check("播放 URL 置空", detail["video_url_720p"] is None))
        results.append(check("字幕保留（点词仍可用）", len(detail["subtitles"]) == 1, f"n={len(detail['subtitles'])}"))
        async with get_async_session_maker()() as db:
            words = (await db.execute(select(Vocabulary).where(Vocabulary.video_id == cold_id))).scalars().all()
            results.append(check("词汇本词行保留", len(words) == 1 and words[0].mastery_level == "mastered"))

        print("\n[8] 幂等 + 不再进建议")
        r = await c.post(f"/api/v1/videos/admin/{cold_id}/takedown", headers=admin_headers)
        results.append(check("重复下线 200", r.status_code == 200, f"status={r.status_code}"))
        r = await c.get("/api/v1/videos/admin/takedown-suggestions", headers=admin_headers)
        results.append(check("已下线不在建议里", cold_id not in [i["id"] for i in r.json()["items"]]))

    print(f"\n{'=' * 56}\n冒烟结果：{sum(results)}/{len(results)} 通过")
    if all(results):
        print("下线全链路通过：建议 → 确认 → 隐藏/释放 → 收藏标注 → 学习记录保留")
        return 0
    print("存在失败项，见上方 [FAIL]")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

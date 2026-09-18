"""E2E smoke for the vocab-set learning loop — real HTTP through the ASGI app.

Not a pytest test (lives outside tests/): boots the FastAPI app on in-memory
SQLite, then drives the full product loop over real HTTP requests:
  加入学习 -> 集合视图 -> 快速过筛(会/不会) -> 中断续筛 -> 闭环 100%

Run: PYTHONUTF8=1 .venv/Scripts/python.exe scripts/smoke_vocab_loop.py
"""

import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# File-backed SQLite: in-memory DBs are per-connection, so the app's own
# connections would not see the tables this script creates.
_SMOKE_DB = os.path.join(tempfile.mkdtemp(prefix="seeword-smoke-"), "smoke.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_SMOKE_DB}"
os.environ.setdefault("SECRET_KEY", "smoke-secret-key-long-enough-for-hs256")

from httpx import ASGITransport, AsyncClient

from app.core.database import Base, get_async_session_maker, get_engine
from app.core.security import create_token, hash_password
from app.main import app
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

    async with get_async_session_maker()() as db:
        user = User(
            phone="13900000001",
            hashed_password=hash_password("Smoke123!"),
            role=RoleType.user,
            onboarding_completed=True,
        )
        db.add(user)
        video = Video(
            title="Smoke 视频：科技新闻",
            source_url="https://example.com/smoke-video",
            status=VideoStatus.ready,
            is_official=True,
            is_published=True,
        )
        db.add(video)
        await db.flush()
        # Word levels: 5 cet4 words + 1 cet6-only word (must be filtered out).
        db.add(
            Subtitle(
                video_id=video.id,
                sentence_index=0,
                start_time=0.0,
                end_time=2.0,
                text_en="apple banana cherry",
                text_zh="苹果 香蕉 樱桃",
                word_levels={"apple": ["cet4"], "banana": ["cet4"], "cherry": ["cet4"]},
            )
        )
        db.add(
            Subtitle(
                video_id=video.id,
                sentence_index=1,
                start_time=2.0,
                end_time=4.0,
                text_en="dragon effort",
                text_zh="龙 努力",
                word_levels={"dragon": ["cet6"], "effort": ["cet4"]},
            )
        )
        await db.commit()
        user_id, video_id = user.id, video.id

    token = create_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://smoke") as c:
        print("\n[1] 加入学习 — POST /api/v1/vocab-sets")
        r = await c.post("/api/v1/vocab-sets", json={"video_id": video_id, "exam_level": "cet4"}, headers=headers)
        results.append(check("HTTP 200", r.status_code == 200, f"status={r.status_code}"))
        body = r.json()
        results.append(check("按 cet4 过滤出 4 个词（排除 cet6 dragon）", body["total"] == 4, f"total={body['total']}"))
        results.append(
            check("反馈文案含等级与数量", "四级" in body["message"] and "4" in body["message"], body["message"])
        )
        set_id = body["id"]

        print("\n[2] 幂等 — 重复加入不重复计数")
        r = await c.post("/api/v1/vocab-sets", json={"video_id": video_id, "exam_level": "cet4"}, headers=headers)
        results.append(check("total 仍为 4", r.json()["total"] == 4, f"total={r.json()['total']}"))
        results.append(check("existed=true", r.json()["existed"] is True))

        print("\n[3] 词汇本集合视图 — GET /api/v1/vocab-sets")
        r = await c.get("/api/v1/vocab-sets", headers=headers)
        sets = r.json()
        results.append(check("返回 1 个集合", len(sets) == 1, f"n={len(sets)}"))
        results.append(check("进度 0/4 未完成", sets[0]["mastered_count"] == 0 and sets[0]["total"] == 4))
        results.append(check("带视频标题（回看入口所需）", bool(sets[0]["title"]), str(sets[0]["title"])))

        print("\n[4] 过筛取词 — GET .../sieve")
        r = await c.get(f"/api/v1/vocab-sets/{set_id}/sieve", headers=headers)
        s = r.json()
        results.append(check("首词为 apple（按字幕顺序）", s["word"]["word"] == "apple", str(s["word"]["word"])))
        results.append(check("带音标（ECDICT）", bool(s["word"]["ipa"]), str(s["word"]["ipa"])))
        results.append(check("进度 0/4", s["sieved_count"] == 0 and s["total"] == 4))
        results.append(check("未完成", s["completed"] is False))

        print("\n[5] 两档判定 — 会 / 不会")
        r = await c.post(
            f"/api/v1/vocab-sets/{set_id}/words/{s['set_word_id']}/sieve",
            json={"known": True},
            headers=headers,
        )
        results.append(
            check("「会」→ 200 且未完成", r.status_code == 200 and r.json()["completed"] is False, str(r.json()))
        )
        r = await c.get(f"/api/v1/vocab-sets/{set_id}/sieve", headers=headers)
        s = r.json()
        r = await c.post(
            f"/api/v1/vocab-sets/{set_id}/words/{s['set_word_id']}/sieve",
            json={"known": False},
            headers=headers,
        )
        results.append(check("「不会」→ 200", r.status_code == 200))

        print("\n[6] 中断续筛 — 重新取词从第 3 个继续")
        r = await c.get(f"/api/v1/vocab-sets/{set_id}/sieve", headers=headers)
        s = r.json()
        results.append(
            check("续筛进度 2/4", s["sieved_count"] == 2 and s["total"] == 4, f"{s['sieved_count']}/{s['total']}")
        )
        results.append(check("下一个是未过筛的词", s["word"]["word"] == "cherry", str(s["word"]["word"])))

        print("\n[7] 掌握状态同步 — 词汇本 mastery")
        r = await c.get(f"/api/v1/vocab-sets/{set_id}?scope=all", headers=headers)
        words = {w["word"]: w for w in r.json()["words"]}
        results.append(
            check(
                "apple「会」→ mastered", words["apple"]["mastery_level"] == "mastered", words["apple"]["mastery_level"]
            )
        )
        results.append(
            check(
                "banana「不会」→ learning",
                words["banana"]["mastery_level"] == "learning",
                words["banana"]["mastery_level"],
            )
        )
        results.append(
            check("cherry 未筛 → new", words["cherry"]["mastery_level"] == "new", words["cherry"]["mastery_level"])
        )
        r = await c.get(f"/api/v1/vocab-sets/{set_id}?scope=unmastered", headers=headers)
        results.append(
            check("「未掌握」筛选 = pending+unknown = 3", len(r.json()["words"]) == 3, f"n={len(r.json()['words'])}")
        )
        r = await c.get(f"/api/v1/vocab-sets/{set_id}?scope=learning", headers=headers)
        results.append(
            check("「学习中」筛选 = unknown = 1", len(r.json()["words"]) == 1, f"n={len(r.json()['words'])}")
        )

        print("\n[8] 闭环终点 — 第一遍过筛 → 待学清单 → 标记已掌握 → 100%")
        # First pass: sieve the remaining pending words (cherry, effort).
        for _ in range(2):
            r = await c.get(f"/api/v1/vocab-sets/{set_id}/sieve", headers=headers)
            s = r.json()
            if not s["set_word_id"]:
                break
            r = await c.post(
                f"/api/v1/vocab-sets/{set_id}/words/{s['set_word_id']}/sieve",
                json={"known": True},
                headers=headers,
            )
        # First pass done: banana is still in the 待学清单 → NOT complete.
        r = await c.get(f"/api/v1/vocab-sets/{set_id}/sieve", headers=headers)
        s = r.json()
        results.append(check("第一遍过筛完但待学清单未清 → 未闭环", s["completed"] is False, str(s)))
        results.append(check("待学清单剩 1 个（banana）", s["unknown_count"] == 1, f"unknown={s['unknown_count']}"))
        results.append(check("已掌握 3/4", s["mastered_count"] == 3 and s["total"] == 4, str(s)))

        # 学完待学清单 → 闭环。
        r = await c.get(f"/api/v1/vocab-sets/{set_id}?scope=learning", headers=headers)
        unknown_words = r.json()["words"]
        results.append(check("待学清单可取词", len(unknown_words) == 1, str(unknown_words[0]["word"])))
        r = await c.post(
            f"/api/v1/vocab-sets/{set_id}/words/{unknown_words[0]['set_word_id']}/learned",
            headers=headers,
        )
        final = r.json()
        results.append(check("标记已掌握 → completed=true", final["completed"] is True, str(final)))
        results.append(check("集合 100%（4/4）", final["mastered_count"] == 4 and final["total"] == 4, str(final)))
        r = await c.get("/api/v1/vocab-sets", headers=headers)
        results.append(check("集合卡片显示已学完", r.json()[0]["mastered_count"] == r.json()[0]["total"]))

        print("\n[9] 越权防护 — 他人集合不可见")
        async with get_async_session_maker()() as db:
            other = User(
                phone="13900000002",
                hashed_password=hash_password("Smoke123!"),
                role=RoleType.user,
                onboarding_completed=True,
            )
            db.add(other)
            await db.commit()
            other_id = other.id
        other_token = create_token(other_id)
        r = await c.get(f"/api/v1/vocab-sets/{set_id}", headers={"Authorization": f"Bearer {other_token}"})
        results.append(check("他人集合 → 404", r.status_code == 404, f"status={r.status_code}"))

        print("\n[10] 零 AI 调用验证 — 收词只读 ECDICT")
        async with get_async_session_maker()() as db:
            from sqlalchemy import select as _select

            vocab_rows = (await db.execute(_select(Vocabulary).where(Vocabulary.user_id == user_id))).scalars().all()
            results.append(check("词行落库 4 条", len(vocab_rows) == 4, f"n={len(vocab_rows)}"))
            results.append(
                check(
                    "释义来自 ECDICT（非空）",
                    all(v.translation for v in vocab_rows),
                    "; ".join(f"{v.word}={v.translation}" for v in vocab_rows),
                )
            )

    print(f"\n{'=' * 56}\n冒烟结果：{sum(results)}/{len(results)} 通过")
    if all(results):
        print("全链路通过：加入学习 → 集合视图 → 过筛 → 续筛 → 闭环")
        return 0
    print("存在失败项，见上方 [FAIL]")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

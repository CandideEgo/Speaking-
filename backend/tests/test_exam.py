"""Tests for the exam system (Phase B): start/submit grading, wrong book,
practice hub stats and the instant-mode video paper.
"""

import pytest
from sqlalchemy import select

from app.models.exam import ExamAnswer, ExamSession
from app.models.favorite import UserFavorite
from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.video import Video, VideoStatus
from app.services import ecdict
from tests.conftest import TestSessionLocal

WORDS = {
    "apple": "苹果",
    "banana": "香蕉",
    "cherry": "樱桃",
    "dragon": "龙",
    "eagle": "鹰",
    "forest": "森林",
}


def _fake_lookup(word: str):
    if word in WORDS:
        return {"lemma": word, "translation": WORDS[word], "phonetic": "x", "levels": ["cet4", "cet6"]}
    return None


@pytest.fixture
def patched_ecdict(monkeypatch):
    monkeypatch.setattr(ecdict, "is_available", lambda: True)
    monkeypatch.setattr(ecdict, "lookup", _fake_lookup)


async def _seed_video(vid: str, words: list[str]) -> None:
    async with TestSessionLocal() as db:
        db.add(
            Video(
                id=vid,
                title=f"Video {vid}",
                source_url="x",
                status=VideoStatus.ready,
                is_official=True,
                is_published=True,
            )
        )
        for i, w in enumerate(words):
            db.add(
                Subtitle(
                    id=f"{vid}-s{i}",
                    video_id=vid,
                    start_time=float(i),
                    end_time=float(i) + 1,
                    text_en=f"I saw a {w} today.",
                    sentence_index=i,
                    word_levels={w: ["cet4", "cet6"]},
                )
            )
        await db.commit()


async def _user_id_from_headers(headers: dict) -> str:
    from app.core.security import decode_token

    token = headers["Authorization"].removeprefix("Bearer ")
    return decode_token(token)["sub"]


async def _get_answers(session_id: str) -> dict[str, dict]:
    """Return {answer_id: question_snapshot} straight from the DB (server side)."""
    async with TestSessionLocal() as db:
        rows = (await db.execute(select(ExamAnswer).where(ExamAnswer.session_id == session_id))).scalars().all()
        return {r.id: r.question for r in rows}


async def _start(client, headers: dict, mode: str, video_id: str | None = None, level: str = "cet4"):
    payload: dict = {"mode": mode, "level": level}
    if video_id:
        payload["video_id"] = video_id
    return await client.post("/api/v1/exam/start", json=payload, headers=headers)


# ---------------------------------------------------------------------------
# start
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_video_exam_start_strips_answers(client, auth_headers, patched_ecdict):
    await _seed_video("vid-exam-1", list(WORDS.keys()))
    resp = await _start(client, auth_headers, "video_exam", video_id="vid-exam-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"]
    assert data["mode"] == "video_exam"
    assert data["time_limit_seconds"] == 1800
    assert len(data["questions"]) > 0
    for q in data["questions"]:
        assert "answer" not in q, "answers must stay server-side in exam mode"
        assert q["id"]


@pytest.mark.asyncio
async def test_video_exam_requires_video_id(client, auth_headers, patched_ecdict):
    resp = await _start(client, auth_headers, "video_exam")
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_start_invalid_mode(client, auth_headers, patched_ecdict):
    resp = await _start(client, auth_headers, "nonsense")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_daily_check_draws_from_favorites(client, auth_headers, patched_ecdict):
    await _seed_video("vid-dc-1", ["apple", "banana", "cherry"])
    await _seed_video("vid-dc-2", ["dragon", "eagle", "forest"])
    user_id = await _user_id_from_headers(auth_headers)
    async with TestSessionLocal() as db:
        db.add(UserFavorite(user_id=user_id, video_id="vid-dc-1"))
        db.add(UserFavorite(user_id=user_id, video_id="vid-dc-2"))
        await db.commit()

    resp = await _start(client, auth_headers, "daily_check")
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "daily_check"
    titles = {q.get("video_title") for q in data["questions"]}
    assert titles == {"Video vid-dc-1", "Video vid-dc-2"}


@pytest.mark.asyncio
async def test_daily_check_empty_when_no_content(client, auth_headers, patched_ecdict):
    resp = await _start(client, auth_headers, "daily_check")
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# submit + grading
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_submit_grades_server_side(client, auth_headers, patched_ecdict):
    await _seed_video("vid-exam-2", list(WORDS.keys()))
    start = await _start(client, auth_headers, "video_exam", video_id="vid-exam-2")
    assert start.status_code == 200
    session_id = start.json()["session_id"]
    snapshots = await _get_answers(session_id)

    # Answer half correctly: right answer for even indices, garbage for odd.
    answers = []
    ids = list(snapshots.keys())
    for i, aid in enumerate(ids):
        q = snapshots[aid]
        if i % 2 == 0:
            answers.append({"id": aid, "user_answer": q["answer"]})
        else:
            answers.append({"id": aid, "user_answer": "definitely wrong"})

    resp = await client.post(f"/api/v1/exam/{session_id}/submit", json={"answers": answers}, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    expected_correct = (len(ids) + 1) // 2
    assert data["correct"] == expected_correct
    assert data["total"] == len(ids)
    assert data["score"] == pytest.approx(expected_correct / len(ids) * 100, abs=0.1)
    assert sum(p["total"] for p in data["part_scores"].values()) == len(ids)
    assert len(data["answers"]) == len(ids)

    # Session persisted as submitted.
    async with TestSessionLocal() as db:
        session = (await db.execute(select(ExamSession).where(ExamSession.id == session_id))).scalar_one()
        assert session.submitted_at is not None
        assert session.score == pytest.approx(data["score"])


@pytest.mark.asyncio
async def test_submit_twice_rejected(client, auth_headers, patched_ecdict):
    await _seed_video("vid-exam-3", list(WORDS.keys()))
    session_id = (await _start(client, auth_headers, "video_exam", video_id="vid-exam-3")).json()["session_id"]
    first = await client.post(f"/api/v1/exam/{session_id}/submit", json={"answers": []}, headers=auth_headers)
    assert first.status_code == 200
    second = await client.post(f"/api/v1/exam/{session_id}/submit", json={"answers": []}, headers=auth_headers)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_submit_other_users_session_404(client, auth_headers, patched_ecdict):
    from app.core.security import create_token, hash_password
    from app.models.user import PlanType, RoleType

    await _seed_video("vid-exam-4", list(WORDS.keys()))
    session_id = (await _start(client, auth_headers, "video_exam", video_id="vid-exam-4")).json()["session_id"]

    async with TestSessionLocal() as db:
        other = User(
            phone="13800138099",
            hashed_password=hash_password("Otherpass1!"),
            name="Other",
            plan=PlanType.free,
            role=RoleType.user,
        )
        db.add(other)
        await db.commit()

    other_id = await _other_id()
    resp = await client.post(
        f"/api/v1/exam/{session_id}/submit",
        json={"answers": []},
        headers={"Authorization": f"Bearer {create_token(other_id)}"},
    )
    assert resp.status_code == 404


async def _other_id() -> str:
    async with TestSessionLocal() as db:
        user = (await db.execute(select(User).where(User.phone == "13800138099"))).scalar_one()
        return user.id


# ---------------------------------------------------------------------------
# wrong book + redo
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_wrong_book_lifecycle(client, auth_headers, patched_ecdict):
    await _seed_video("vid-wrong-1", list(WORDS.keys()))
    session_id = (await _start(client, auth_headers, "video_exam", video_id="vid-wrong-1")).json()["session_id"]

    # Everything wrong → wrong book fills up.
    resp = await client.post(f"/api/v1/exam/{session_id}/submit", json={"answers": []}, headers=auth_headers)
    assert resp.status_code == 200
    wrong = (await client.get("/api/v1/practice/wrong", headers=auth_headers)).json()
    assert wrong["count"] > 0
    assert all(it["stem"] for it in wrong["items"])

    # Redo: answer everything correctly → wrong book clears.
    redo = await client.post("/api/v1/practice/wrong/redo", headers=auth_headers)
    assert redo.status_code == 200
    redo_data = redo.json()
    assert redo_data["mode"] == "wrong_redo"
    snapshots = await _get_answers(redo_data["session_id"])
    answers = [{"id": aid, "user_answer": q["answer"]} for aid, q in snapshots.items()]
    resp = await client.post(
        f"/api/v1/exam/{redo_data['session_id']}/submit", json={"answers": answers}, headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["correct"] == resp.json()["total"]

    wrong = (await client.get("/api/v1/practice/wrong", headers=auth_headers)).json()
    assert wrong["count"] == 0


@pytest.mark.asyncio
async def test_wrong_redo_empty_book(client, auth_headers, patched_ecdict):
    resp = await client.post("/api/v1/practice/wrong/redo", headers=auth_headers)
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# practice hub
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_practice_hub_stats(client, auth_headers, patched_ecdict):
    await _seed_video("vid-hub-1", list(WORDS.keys()))
    session_id = (await _start(client, auth_headers, "video_exam", video_id="vid-hub-1")).json()["session_id"]
    snapshots = await _get_answers(session_id)
    answers = [{"id": aid, "user_answer": q["answer"]} for aid, q in snapshots.items()]
    sub_resp = await client.post(f"/api/v1/exam/{session_id}/submit", json={"answers": answers}, headers=auth_headers)
    assert sub_resp.json()["score"] == 100.0

    resp = await client.get("/api/v1/practice/hub", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["month_count"] == 1
    assert data["week_count"] == 1
    assert data["avg_accuracy"] == 100.0
    assert data["wrong_count"] == 0
    assert data["last_check"] is None  # no daily_check yet
    assert len(data["papers"]) == 1
    paper = data["papers"][0]
    assert paper["video_id"] == "vid-hub-1"
    assert paper["question_count"] == len(WORDS)
    assert paper["progress"] == 100
    assert paper["last_score"] == 100.0


@pytest.mark.asyncio
async def test_practice_hub_empty(client, auth_headers, patched_ecdict):
    resp = await client.get("/api/v1/practice/hub", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["month_count"] == 0
    assert data["avg_accuracy"] is None
    assert data["papers"] == []


# ---------------------------------------------------------------------------
# instant-mode video paper
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_video_paper_instant_includes_answers(client, auth_headers, patched_ecdict):
    await _seed_video("vid-paper-1", list(WORDS.keys()))
    resp = await client.get("/api/v1/videos/vid-paper-1/paper", params={"level": "cet4"}, headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["video_id"] == "vid-paper-1"
    assert data["exam_level"] == "cet4"
    assert len(data["items"]) > 0
    # Instant mode is client-graded: answers must be present.
    assert all("answer" in it for it in data["items"])


@pytest.mark.asyncio
async def test_video_paper_invalid_level(client, auth_headers, patched_ecdict):
    resp = await client.get("/api/v1/videos/vid-x/paper", params={"level": "bogus"}, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_video_paper_missing_video(client, auth_headers, patched_ecdict):
    resp = await client.get("/api/v1/videos/no-such-video/paper", params={"level": "cet4"}, headers=auth_headers)
    assert resp.status_code == 404

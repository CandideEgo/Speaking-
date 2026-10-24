import pytest
from sqlalchemy import func, select

from app.models.learning_plan import LearningEvent
from app.models.listening import ListeningSession
from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.video import Video, VideoStatus
from app.services.listening_service import grade


async def seed(db, *, cues=True, offline=False):
    video = Video(
        title="Real lesson",
        source_url="https://example.com/lesson",
        duration=40,
        status=VideoStatus.ready,
        is_official=True,
        is_published=True,
        storage_mode="offline" if offline else "local",
        video_url_720p="/media/lesson.mp4",
    )
    db.add(video)
    await db.flush()
    if cues:
        for i, text in enumerate(["You just blink to keep your eyes moist.", "You can close your eyes at night."]):
            db.add(
                Subtitle(
                    video_id=video.id,
                    sentence_index=i,
                    start_time=1 + i * 5,
                    end_time=4 + i * 5,
                    text_en=text,
                    text_zh="真实字幕译文",
                )
            )
    await db.commit()
    return video


async def test_listening_auth_required(client):
    assert (await client.get("/api/v1/listening/videos")).status_code == 401


async def test_catalog_excludes_offline_and_empty(client, auth_headers, db_session):
    video = await seed(db_session)
    await seed(db_session, cues=False)
    await seed(db_session, offline=True)
    response = await client.get("/api/v1/listening/videos?page_size=1", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["video"]["id"] == video.id
    assert data["items"][0]["question_count"] == 2
    assert not data["has_more"]


async def test_draft_resume_grade_and_idempotence(client, auth_headers, db_session):
    video = await seed(db_session)
    response = await client.post("/api/v1/listening/sessions", headers=auth_headers, json={"video_id": video.id})
    assert response.status_code == 200, response.text
    session = response.json()
    sid = session["id"]
    assert len(session["questions"]) == 2
    assert "text_en" not in session["questions"][0]
    assert session["results"] is None
    qid = session["questions"][0]["id"]
    row = await db_session.get(ListeningSession, sid)
    expected = row.questions[0]["text_en"]
    saved = await client.put(
        f"/api/v1/listening/sessions/{sid}",
        headers=auth_headers,
        json={"answers": {qid: expected.upper().replace(".", "!")}, "current_index": 1},
    )
    assert saved.status_code == 200
    resumed = (
        await client.post("/api/v1/listening/sessions", headers=auth_headers, json={"video_id": video.id})
    ).json()
    assert resumed["id"] == sid
    assert resumed["current_index"] == 1
    assert resumed["answers"][qid]
    first = await client.post(f"/api/v1/listening/sessions/{sid}/submit", headers=auth_headers)
    assert first.status_code == 200, first.text
    result = first.json()
    assert result["correct_count"] == 1
    assert result["results"][1]["accuracy"] == 0
    assert result["questions"][0]["text_en"] == expected
    again = (await client.post(f"/api/v1/listening/sessions/{sid}/submit", headers=auth_headers)).json()
    assert again["submitted_at"] == result["submitted_at"]
    assert (
        await client.put(f"/api/v1/listening/sessions/{sid}", headers=auth_headers, json={"answers": {}})
    ).status_code == 409
    count = await db_session.scalar(
        select(func.count()).select_from(LearningEvent).where(LearningEvent.event_type == "practiced_items")
    )
    assert count == 1
    restarted = (
        await client.post(
            "/api/v1/listening/sessions", headers=auth_headers, json={"video_id": video.id, "restart": True}
        )
    ).json()
    assert restarted["id"] != sid


async def test_foreign_session_and_invalid_answers(client, auth_headers, db_session):
    video = await seed(db_session)
    stranger = User(phone="13888888123", hashed_password="not-used")
    db_session.add(stranger)
    await db_session.flush()
    private = ListeningSession(user_id=stranger.id, video_id=video.id, title="private", questions=[], answers={})
    db_session.add(private)
    await db_session.commit()
    for method, path in [(client.get, ""), (client.post, "/submit")]:
        assert (await method(f"/api/v1/listening/sessions/{private.id}{path}", headers=auth_headers)).status_code == 404
    own = (await client.post("/api/v1/listening/sessions", headers=auth_headers, json={"video_id": video.id})).json()
    assert (
        await client.put(
            f"/api/v1/listening/sessions/{own['id']}", headers=auth_headers, json={"answers": {"foreign": "injected"}}
        )
    ).status_code == 422
    assert (
        await client.put(f"/api/v1/listening/sessions/{own['id']}", headers=auth_headers, json={"current_index": 9})
    ).status_code == 422
    assert (
        await client.put(
            f"/api/v1/listening/sessions/{own['id']}",
            headers=auth_headers,
            json={"answers": {own["questions"][0]["id"]: "a" * 2001}},
        )
    ).status_code == 422


async def test_empty_and_unpublished_cannot_start(client, auth_headers, db_session):
    video = await seed(db_session, cues=False)
    assert (
        await client.post("/api/v1/listening/sessions", headers=auth_headers, json={"video_id": video.id})
    ).status_code == 422
    video.is_published = False
    await db_session.commit()
    assert (
        await client.post("/api/v1/listening/sessions", headers=auth_headers, json={"video_id": video.id})
    ).status_code == 404


@pytest.mark.parametrize(
    "reference,answer,correct",
    [
        ("Don't worry, we're ready.", "DONT worry were READY!", True),
        ("You blink.", "You don't blink", False),
        ("I see the sea.", "I sea the see", False),
        ("A real answer.", "", False),
    ],
)
def test_grading(reference, answer, correct):
    result = grade(reference, answer)
    assert result["correct"] is correct
    assert 0 <= result["accuracy"] <= 100

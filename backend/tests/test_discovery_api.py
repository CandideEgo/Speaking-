"""Persistent user-content actions and read-only recommendation boundaries."""

import pytest
from sqlalchemy import func, select

from app.core.security import create_token
from app.models.channel import Channel
from app.models.exam_test import ExamAnswer, ExamPaper, ExamQuestion, ExamSession
from app.models.learning import Vocabulary
from app.models.subtitle import Subtitle
from app.models.user import User
from app.models.user_content import ChannelSubscription, SentenceFavorite
from app.models.video import Video, VideoStatus
from app.services import ecdict


async def user_id(client, auth_headers):
    return (await client.get("/api/v1/users/me", headers=auth_headers)).json()["id"]


async def content(db, owner_id):
    video = Video(
        user_id=owner_id,
        title="Learning habits",
        source_url="https://example.com/video",
        video_source="local",
        status=VideoStatus.ready,
        is_official=True,
        is_published=True,
    )
    db.add(video)
    await db.flush()
    subtitle = Subtitle(
        video_id=video.id,
        sentence_index=0,
        start_time=0,
        end_time=5,
        text_en="Build a learning habit.",
        text_zh="建立学习习惯。",
        word_levels={"habit": ["cet4"]},
    )
    channel = Channel(name="Learning", slug="learning", is_visible=True)
    db.add_all([subtitle, channel])
    await db.commit()
    return video, subtitle, channel


@pytest.mark.asyncio
async def test_interests_roundtrip_validation_and_cache_invalidation(client, auth_headers, fake_redis):
    uid = await user_id(client, auth_headers)
    key = f"recommend:home:{uid}:1:20"
    await fake_redis.set(key, "cached")
    response = await client.put(
        "/api/v1/users/me/preferences", headers=auth_headers, json={"interest_categories": ["tech", "ted", "tech"]}
    )
    assert response.status_code == 200
    assert response.json()["interest_categories"] == ["tech", "ted"]
    assert await fake_redis.get(key) is None
    assert (await client.get("/api/v1/users/me/preferences", headers=auth_headers)).json()["interest_categories"] == [
        "tech",
        "ted",
    ]
    assert (
        await client.put(
            "/api/v1/users/me/preferences", headers=auth_headers, json={"interest_categories": ["invented"]}
        )
    ).status_code == 422


@pytest.mark.asyncio
async def test_explicit_interests_sort_small_pools_and_empty_preferences_restore_ranking(
    client, auth_headers, db_session
):
    uid = await user_id(client, auth_headers)
    tech, _, _ = await content(db_session, uid)
    tech.topic_tags = "tech"
    tech.score = 51
    ted = Video(
        user_id=uid,
        title="Talk",
        source_url="https://example.com/talk",
        video_source="local",
        status=VideoStatus.ready,
        is_official=True,
        is_published=True,
        topic_tags="ted",
        score=50,
    )
    db_session.add(ted)
    await db_session.commit()
    await client.put("/api/v1/users/me/preferences", headers=auth_headers, json={"interest_categories": ["ted"]})
    feed = (await client.get("/api/v1/recommendations/home", headers=auth_headers)).json()
    assert feed["items"][0]["id"] == ted.id
    await client.put("/api/v1/users/me/preferences", headers=auth_headers, json={"interest_categories": []})
    feed = (await client.get("/api/v1/recommendations/home", headers=auth_headers)).json()
    assert feed["items"][0]["id"] == tech.id


@pytest.mark.asyncio
async def test_subscriptions_and_sentence_favorites_are_persistent_idempotent_and_private(
    client, auth_headers, db_session
):
    uid = await user_id(client, auth_headers)
    video, subtitle, channel = await content(db_session, uid)
    for _ in range(2):
        assert (
            await client.put(f"/api/v1/discovery/subscriptions/{channel.slug}", headers=auth_headers)
        ).status_code == 200
        assert (
            await client.put(f"/api/v1/discovery/sentence-favorites/{subtitle.id}", headers=auth_headers)
        ).status_code == 200
    assert (await db_session.scalar(select(func.count(ChannelSubscription.id)))) == 1
    assert (await db_session.scalar(select(func.count(SentenceFavorite.id)))) == 1
    stranger = User(phone="13999999222", name="Other")
    db_session.add(stranger)
    await db_session.commit()
    other_headers = {"Authorization": f"Bearer {create_token(stranger.id)}"}
    assert (await client.get("/api/v1/discovery/subscriptions", headers=other_headers)).json() == []
    assert (await client.get("/api/v1/discovery/sentence-favorites", headers=other_headers)).json()["items"] == []
    await client.delete(f"/api/v1/discovery/sentence-favorites/{subtitle.id}", headers=other_headers)
    assert (await db_session.scalar(select(func.count(SentenceFavorite.id)))) == 1
    saved = (await client.get("/api/v1/discovery/sentence-favorites", headers=auth_headers)).json()
    assert saved["items"][0]["start_time"] == 0
    assert (await client.get("/api/v1/discovery/subscriptions", headers=auth_headers)).json()[0]["id"] == channel.id
    assert (await client.get("/api/v1/discovery/subscriptions")).status_code == 401
    video.is_published = False
    await db_session.commit()
    saved = (await client.get("/api/v1/discovery/sentence-favorites", headers=auth_headers)).json()
    assert saved["items"][0]["available"] is False
    assert saved["items"][0]["text_zh"] is None
    assert (
        await client.put(f"/api/v1/discovery/sentence-favorites/{subtitle.id}", headers=auth_headers)
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/discovery/sentence-favorites/{subtitle.id}", headers=auth_headers)
    ).status_code == 200


@pytest.mark.asyncio
async def test_grouped_video_search_does_not_offer_an_extra_empty_page(client, auth_headers, db_session):
    video, _, _ = await content(db_session, await user_id(client, auth_headers))
    first = await client.get("/api/v1/discovery/search?q=habits&group=videos&page_size=1", headers=auth_headers)
    assert first.status_code == 200
    assert [item["id"] for item in first.json()["videos"]["items"]] == [video.id]
    assert first.json()["videos"]["has_more"] is False
    second = await client.get("/api/v1/discovery/search?q=habits&group=videos&page_size=1&page=2", headers=auth_headers)
    assert second.json()["videos"] == {"items": [], "has_more": False}


@pytest.mark.asyncio
async def test_batch_learning_metadata_hides_unpublished_video(client, auth_headers, db_session):
    video, subtitle, _ = await content(db_session, await user_id(client, auth_headers))
    subtitle.words = [{"word": "Build", "start": 0, "end": 0.6}]
    await db_session.commit()
    response = await client.get(f"/api/v1/discovery/learning-metadata?ids={video.id}")
    assert response.json()[video.id]["subtitle_count"] == 1
    assert response.json()[video.id]["exam_word_count"] == 1
    preview = response.json()[video.id]
    assert preview["sample_subtitle_id"] == subtitle.id
    assert preview["sample_start_time"] == 0
    assert preview["sample_end_time"] == 5
    assert preview["sample_word_timestamps"] == [{"word": "Build", "start": 0, "end": 0.6}]
    video.is_published = False
    await db_session.commit()
    assert (await client.get(f"/api/v1/discovery/learning-metadata?ids={video.id}")).json() == {}


# Tokens -> fake ``ecdict.lookup`` entries with the real return shape
# (``app/services/ecdict.py::_build_index``). Tokens missing here resolve to
# None, exercising the "keep the word, null glosses" rule.
_FAKE_SAMPLE_ENTRIES: dict[str, dict] = {
    "rush": {"lemma": "rush", "phonetic": "rʌʃ", "translation": "n. 匆忙；急促", "levels": ["cet4"]},
    "mitigate": {"lemma": "mitigate", "phonetic": "ˈmɪtɪɡeɪt", "translation": "v. 减轻", "levels": ["cet6"]},
    "risk": {"lemma": "risk", "phonetic": "rɪsk", "translation": "n. 风险", "levels": ["cet4"]},
    "leverage": {"lemma": "leverage", "phonetic": "ˈlevərɪdʒ", "translation": "n. 杠杆", "levels": ["cet6"]},
    "kick": {"lemma": "kick", "phonetic": "kɪk", "translation": "v. 踢", "levels": ["zhongkao", "gaoKao"]},
    "flick": {"lemma": "flick", "phonetic": "flɪk", "translation": "v. 轻弹", "levels": ["zhongkao"]},
    "skip": {"lemma": "skip", "phonetic": "skɪp", "translation": "v. 跳过", "levels": ["zhongkao"]},
    "word": {"lemma": "word", "phonetic": "wɜːd", "translation": "n. 单词", "levels": ["cet4"]},
}


def _fake_ecdict_lookup(token: str) -> dict | None:
    return _FAKE_SAMPLE_ENTRIES.get(token.lower())


async def metadata_video(db, owner_id: str, sentences: list[tuple[str, dict | None]]) -> Video:
    """A published official video whose subtitles are given in sentence order."""
    video = Video(
        user_id=owner_id,
        title="Sample words",
        source_url="https://example.com/sample-words",
        video_source="local",
        status=VideoStatus.ready,
        is_official=True,
        is_published=True,
    )
    db.add(video)
    await db.flush()
    for index, (text_en, word_levels) in enumerate(sentences):
        db.add(
            Subtitle(
                video_id=video.id,
                sentence_index=index,
                start_time=index * 5,
                end_time=index * 5 + 5,
                text_en=text_en,
                text_zh="示例",
                word_levels=word_levels,
            )
        )
    await db.commit()
    return video


@pytest.mark.asyncio
async def test_learning_metadata_sample_words_follow_the_home_card_rules(client, auth_headers, db_session, monkeypatch):
    monkeypatch.setattr(ecdict, "is_available", lambda: True)
    monkeypatch.setattr(ecdict, "lookup", _fake_ecdict_lookup)
    uid = await user_id(client, auth_headers)
    primary = await metadata_video(
        db_session,
        uid,
        [
            (
                "Rush them to mitigate risk with leverage.",
                {
                    "them": ["zhongkao", "gaoKao"],
                    "leverage": ["cet6"],
                    "risk": ["cet4"],
                    "mitigate": ["cet6"],
                    "rush": ["cet4"],
                },
            ),
            # Later sentences must not contribute candidates.
            ("A second sentence with unique.", {"unique": ["cet6"]}),
        ],
    )
    fallback = await metadata_video(
        db_session,
        uid,
        [("Kick. Flick. Skip.", {"skip": ["zhongkao"], "flick": ["gaoKao"], "kick": ["zhongkao", "gaoKao"]})],
    )
    empty = await metadata_video(db_session, uid, [("Nothing annotated.", None)])
    sparse = await metadata_video(
        db_session,
        uid,
        [("Obscure word.", {"ghost": ["cet6"], "obscure": ["ky"], "word": ["cet4"]})],
    )
    ids = ",".join([primary.id, fallback.id, empty.id, sparse.id])
    response = await client.get(f"/api/v1/discovery/learning-metadata?ids={ids}")
    assert response.status_code == 200
    data = response.json()

    # Shape + filter (them/zhongkao/gaoKao dropped) + order (appearance) + max 3.
    assert data[primary.id]["sample_words"] == [
        {"word": "rush", "phonetic": "rʌʃ", "translation": "n. 匆忙；急促", "levels": ["cet4"]},
        {"word": "mitigate", "phonetic": "ˈmɪtɪɡeɪt", "translation": "v. 减轻", "levels": ["cet6"]},
        {"word": "risk", "phonetic": "rɪsk", "translation": "n. 风险", "levels": ["cet4"]},
    ]
    assert len(data[primary.id]["sample_words"]) == 3
    # Existing fields are untouched.
    assert data[primary.id]["subtitle_count"] == 2
    assert data[primary.id]["exam_word_count"] == 6
    assert data[primary.id]["sample_text_en"] == "Rush them to mitigate risk with leverage."

    # No CET+ word: fall back to the unfiltered appearance order so the card
    # still gets phonetics and translations.
    assert [item["word"] for item in data[fallback.id]["sample_words"]] == ["kick", "flick", "skip"]

    # No word_levels: the field still exists and is [].
    assert data[empty.id]["sample_words"] == []

    # Unknown-token glosses are null but the word stays; tokens absent from the
    # sentence sort last.
    assert data[sparse.id]["sample_words"] == [
        {"word": "obscure", "phonetic": None, "translation": None, "levels": ["ky"]},
        {"word": "word", "phonetic": "wɜːd", "translation": "n. 单词", "levels": ["cet4"]},
        {"word": "ghost", "phonetic": None, "translation": None, "levels": ["cet6"]},
    ]


@pytest.mark.asyncio
async def test_learning_metadata_sample_words_degrade_when_ecdict_is_unusable(
    client, auth_headers, db_session, monkeypatch
):
    uid = await user_id(client, auth_headers)
    video = await metadata_video(db_session, uid, [("Rush to mitigate.", {"rush": ["cet4"], "mitigate": ["cet6"]})])
    url = f"/api/v1/discovery/learning-metadata?ids={video.id}"

    monkeypatch.setattr(ecdict, "is_available", lambda: False)
    payload = (await client.get(url)).json()[video.id]
    assert payload["sample_words"] == []
    assert payload["exam_word_count"] == 2

    def failing_lookup(token: str) -> dict | None:
        raise RuntimeError("ecdict index unavailable")

    monkeypatch.setattr(ecdict, "is_available", lambda: True)
    monkeypatch.setattr(ecdict, "lookup", failing_lookup)
    response = await client.get(url)
    assert response.status_code == 200
    payload = response.json()[video.id]
    assert payload["sample_words"] == []
    assert payload["sample_text_en"] == "Rush to mitigate."


@pytest.mark.asyncio
async def test_learning_metadata_preview_skips_credits_and_keeps_sentence_link_aligned(
    client, auth_headers, db_session, monkeypatch
):
    monkeypatch.setattr(ecdict, "is_available", lambda: False)
    video = await metadata_video(
        db_session,
        await user_id(client, auth_headers),
        [
            ("Leonardo Silva Reviewer", None),
            ("Hello everyone and welcome back.", None),
            ("So in college,", None),
            ("These have billions of memory bits.", {"memory": ["cet4"]}),
        ],
    )
    response = await client.get(f"/api/v1/discovery/learning-metadata?ids={video.id}")
    preview = response.json()[video.id]
    selected = await db_session.scalar(
        select(Subtitle).where(Subtitle.video_id == video.id, Subtitle.sentence_index == 3)
    )
    assert preview["subtitle_count"] == 4
    assert preview["sample_text_en"] == selected.text_en
    assert preview["sample_subtitle_id"] == selected.id
    assert preview["sample_start_time"] == selected.start_time
    assert preview["sample_end_time"] == selected.end_time


@pytest.mark.asyncio
async def test_custom_set_reuses_owned_words_and_deletion_preserves_vocabulary(client, auth_headers, db_session):
    uid = await user_id(client, auth_headers)
    vocabulary = Vocabulary(user_id=uid, word="habit", translation="习惯")
    stranger = User(phone="13999999111", name="Other")
    db_session.add_all([vocabulary, stranger])
    await db_session.flush()
    foreign_word = Vocabulary(user_id=stranger.id, word="private")
    db_session.add(foreign_word)
    await db_session.commit()
    created = await client.post(
        "/api/v1/discovery/sets", headers=auth_headers, json={"source_type": "custom", "name": "我的词"}
    )
    assert created.status_code == 201
    sid = created.json()["id"]
    empty_celebration = await client.post(f"/api/v1/vocab-sets/{sid}/celebrate", headers=auth_headers)
    assert empty_celebration.status_code == 410
    assert empty_celebration.json()["code"] == "FEATURE_RETIRED"
    assert (
        await client.post(
            f"/api/v1/discovery/sets/{sid}/words", headers=auth_headers, json={"vocabulary_ids": [foreign_word.id]}
        )
    ).status_code == 404
    for expected in (1, 0):
        response = await client.post(
            f"/api/v1/discovery/sets/{sid}/words", headers=auth_headers, json={"vocabulary_ids": [vocabulary.id]}
        )
        assert response.json()["added"] == expected
    detail = (await client.get(f"/api/v1/vocab-sets/{sid}", headers=auth_headers)).json()
    assert detail["source_type"] == "custom" and detail["title"] == "我的词"
    assert detail["video_id"] is None and detail["words"][0]["word"] == "habit"
    assert (await client.delete(f"/api/v1/discovery/sets/{sid}", headers=auth_headers)).status_code == 200
    assert await db_session.get(Vocabulary, vocabulary.id) is not None


@pytest.mark.asyncio
async def test_exam_set_is_reused_and_only_accepts_matching_dictionary_words(
    client, auth_headers, db_session, monkeypatch
):
    entry = {
        "lemma": "habit",
        "translation": "习惯",
        "definition": "habit",
        "phonetic": "",
        "pos": "n",
        "levels": ["cet4"],
    }
    monkeypatch.setattr(ecdict, "lookup", lambda word: entry if word == "habit" else None)
    monkeypatch.setattr(ecdict, "entries", lambda: [entry])
    ids = [
        (
            await client.post(
                "/api/v1/discovery/sets", headers=auth_headers, json={"source_type": "exam", "exam_level": "cet4"}
            )
        ).json()["id"]
        for _ in range(2)
    ]
    assert ids[0] == ids[1]
    added = await client.post(f"/api/v1/discovery/sets/{ids[0]}/words", headers=auth_headers, json={"words": ["habit"]})
    assert added.status_code == 200 and added.json()["added"] == 1
    assert (
        await client.post(f"/api/v1/discovery/sets/{ids[0]}/words", headers=auth_headers, json={"words": ["invented"]})
    ).status_code == 400
    search = await client.get("/api/v1/discovery/search?q=habit&group=words", headers=auth_headers)
    assert search.status_code == 200 and search.json()["words"]["items"][0]["lemma"] == "habit"


@pytest.mark.asyncio
async def test_daily_preview_does_not_write_and_start_binds_complete_group(client, auth_headers, db_session):
    paper = ExamPaper(title="Test CET4", level="cet4", year=2025, month=6, set_no=1)
    db_session.add(paper)
    await db_session.flush()
    for i in range(4):
        db_session.add(
            ExamQuestion(
                paper_id=paper.id,
                number=i + 1,
                section="reading_C",
                passage="Passage A" if i < 2 else "Passage B",
                question="Choose",
                options={"A": "yes", "B": "no"},
                answer="A",
                question_type="reading",
            )
        )
    await db_session.commit()
    previews = [
        (await client.get(f"/api/v1/discovery/daily?variant={variant}", headers=auth_headers)).json()
        for variant in (0, 1)
    ]
    assert previews[0]["passage"] != previews[1]["passage"]
    assert previews[0]["question_count"] == 2
    assert (await db_session.scalar(select(func.count(ExamSession.id)))) == 0
    response = await client.post(
        "/api/v1/discovery/daily/start", headers=auth_headers, json={"token": previews[0]["token"]}
    )
    assert response.status_code == 200
    started = response.json()
    assert len(started["questions"]) == 2
    assert all("answer" not in question for question in started["questions"])
    again = await client.post(
        "/api/v1/discovery/daily/start", headers=auth_headers, json={"token": previews[0]["token"]}
    )
    assert again.json()["session_id"] == started["session_id"]
    assert (await db_session.scalar(select(func.count(ExamAnswer.id)))) == 2
    graded = await client.post(
        f"/api/v1/exams/attempts/{started['session_id']}/submit",
        headers=auth_headers,
        json={"answers": [{"question_id": q["id"], "answer": "A"} for q in started["questions"]]},
    )
    assert graded.status_code == 200
    assert graded.json()["total"] == 2 and graded.json()["correct_count"] == 2
    assert (await db_session.scalar(select(func.count(ExamAnswer.id)))) == 2
    forged = await client.post("/api/v1/discovery/daily/start", headers=auth_headers, json={"token": "forged"})
    assert forged.status_code == 400

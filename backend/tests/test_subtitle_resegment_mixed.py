"""Mixed aligned/manual cues must not disappear during re-segmentation."""

from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models.learning import Vocabulary
from app.models.subtitle import Subtitle
from app.models.user_content import SentenceFavorite
from app.services.subtitle_resegment_rules import resegment_segments
from tests.conftest import TestSessionLocal
from tests.test_subtitle_resegment import _seed


@pytest.mark.parametrize("manual_index", [0, 1, 2])
def test_manual_cue_is_preserved_at_each_position_without_faking_word_alignment(manual_index):
    cues = []
    for index, text in enumerate(["First aligned sentence.", "Middle edited sentence.", "Last aligned sentence."]):
        tokens = text.split()
        cues.append(
            SimpleNamespace(
                start_time=index * 3.0,
                end_time=(index + 1) * 3.0,
                text_en=text,
                words=None
                if index == manual_index
                else [
                    {"word": token, "start": index * 3.0 + offset, "end": index * 3.0 + offset + 1}
                    for offset, token in enumerate(tokens)
                ],
            )
        )
    result = resegment_segments(cues)
    assert " ".join(row["text"] for row in result) == " ".join(cue.text_en for cue in cues)
    for index, row in enumerate(result):
        assert row["start"] == cues[index].start_time and row["end"] == cues[index].end_time
        assert row["words"] == cues[index].words


def test_segment_crossing_manual_and_aligned_words_does_not_claim_full_alignment():
    aligned = [{"word": "Hello", "start": 0.0, "end": 1.0}]
    result = resegment_segments(
        [
            SimpleNamespace(start_time=0.0, end_time=1.0, text_en="Hello", words=aligned),
            SimpleNamespace(start_time=1.0, end_time=4.0, text_en="from a manual cue.", words=None),
        ]
    )
    assert len(result) == 1
    assert result[0]["text"] == "Hello from a manual cue."
    assert result[0]["words"] is None
    assert aligned == [{"word": "Hello", "start": 0.0, "end": 1.0}]


async def test_mixed_resegment_and_rollback_keep_manual_text_favorites_and_word_source(client, admin_headers):
    vid = await _seed(
        [
            {
                "start": 0,
                "end": 3,
                "text": "First aligned sentence.",
                "zh": "第一句",
                "words": [
                    {"word": "First", "start": 0, "end": 1},
                    {"word": "aligned", "start": 1, "end": 2},
                    {"word": "sentence.", "start": 2, "end": 3},
                ],
            },
            {"start": 3, "end": 6, "text": "Manual edited sentence.", "zh": "手工句子"},
        ]
    )
    uid = (await client.get("/api/v1/users/me", headers=admin_headers)).json()["id"]
    async with TestSessionLocal() as db:
        manual = await db.scalar(select(Subtitle).where(Subtitle.video_id == vid, Subtitle.sentence_index == 1))
        fav = SentenceFavorite(user_id=uid, subtitle_id=manual.id)
        word = Vocabulary(user_id=uid, word="manual", video_id=vid, subtitle_id=manual.id)
        db.add_all([fav, word])
        await db.commit()
        fid, wid = fav.id, word.id
    result = await client.post(f"/api/v1/videos/admin/{vid}/subtitles/resegment", headers=admin_headers)
    assert result.status_code == 200, result.text
    assert result.json()["after_count"] == 2
    assert result.json()["favorites_remapped"] == result.json()["vocabulary_relinked"] == 1
    async with TestSessionLocal() as db:
        manual = await db.scalar(select(Subtitle).where(Subtitle.video_id == vid, Subtitle.sentence_index == 1))
        assert manual.text_en == "Manual edited sentence." and manual.words is None
        assert (await db.get(SentenceFavorite, fid)).subtitle_id == manual.id
        assert (await db.get(Vocabulary, wid)).subtitle_id == manual.id
    result = await client.post(f"/api/v1/videos/admin/{vid}/subtitles/resegment/rollback", headers=admin_headers)
    assert result.status_code == 200, result.text
    async with TestSessionLocal() as db:
        manual = await db.scalar(select(Subtitle).where(Subtitle.video_id == vid, Subtitle.sentence_index == 1))
        assert manual.text_en == "Manual edited sentence." and manual.text_zh == "手工句子"
        assert (await db.get(SentenceFavorite, fid)).subtitle_id == manual.id
        assert (await db.get(Vocabulary, wid)).subtitle_id == manual.id

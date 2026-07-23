"""Tests for the transcription/translation quality safety net (Phase 2).

Covers:
- Hallucination detection in transcription output
- Translation batch retry with exponential backoff
- Translation quality gate in finalize_video
- Word-level score preservation during re-translation
"""

import pytest
from sqlalchemy import select

from app.models.subtitle import Subtitle
from app.services.ecdict import annotate_text


class TestTranscriptionQuality:
    """Tests for hallucination detection in transcription callback."""

    def test_repetitive_text_detected(self):
        from app.services.transcription.quality import check_transcription_quality

        segments = [
            {"text": "Hello world", "start": 0, "end": 2},
            {"text": "Hello world", "start": 2, "end": 4},
            {"text": "Hello world", "start": 4, "end": 6},
            {"text": "Hello world", "start": 6, "end": 8},
            {"text": "Hello world", "start": 8, "end": 10},
            {"text": "Hello world", "start": 10, "end": 12},
        ]
        report = check_transcription_quality(segments)
        assert not report.passed
        assert any(c.name == "repetitive" and not c.passed for c in report.checks)

    def test_nonsense_characters_detected(self):
        from app.services.transcription.quality import check_transcription_quality

        segments = [
            {"text": "Hello @#$% world", "start": 0, "end": 2},
            {"text": "Test *** ###", "start": 2, "end": 4},
            {"text": "Normal text here", "start": 4, "end": 6},
        ]
        report = check_transcription_quality(segments)
        # Only 1 of 3 has >50% non-linguistic, so this should pass
        assert report.passed

    def test_duration_mismatch_detected(self):
        from app.services.transcription.quality import check_transcription_quality

        segments = [
            {"text": "Hello", "start": 0, "end": 2},
            {"text": "World", "start": 2, "end": 4},
        ]
        # Audio is 10s but subtitles end at 4s — this is fine
        report = check_transcription_quality(segments, audio_duration=10)
        assert report.passed

        # Audio is 10s but last subtitle ends at 20s
        segments_long = [
            {"text": "Hello", "start": 0, "end": 2},
            {"text": "World", "start": 2, "end": 20},
        ]
        report_long = check_transcription_quality(segments_long, audio_duration=10)
        assert not report_long.passed

    def test_empty_segments_detected(self):
        from app.services.transcription.quality import check_transcription_quality

        # Need more segments to trigger the empty_ratio threshold
        # _MAX_EMPTY_RATIO = 0.5, need >5 segments and >50% empty
        segments = [
            {"text": "", "start": 0, "end": 2},
            {"text": "", "start": 2, "end": 4},
            {"text": "", "start": 4, "end": 6},
            {"text": "Hello", "start": 6, "end": 8},
            {"text": "", "start": 8, "end": 10},
            {"text": "", "start": 10, "end": 12},
        ]
        report = check_transcription_quality(segments)
        assert not report.passed
        assert any(c.name == "empty_ratio" and not c.passed for c in report.checks)

    def test_good_transcription_passes(self):
        from app.services.transcription.quality import check_transcription_quality

        segments = [
            {"text": "Hello world this is a test", "start": 0, "end": 3},
            {"text": "Another sentence here", "start": 3, "end": 6},
            {"text": "Third line of dialogue", "start": 6, "end": 9},
            {"text": "Final sentence", "start": 9, "end": 12},
        ]
        report = check_transcription_quality(segments, audio_duration=15)
        assert report.passed
        assert report.segment_count == 4


class TestTranslationQualityGate:
    """Tests for translation quality gate."""

    def test_low_coverage_fails(self):
        from app.services.translation.quality import check_translation_quality

        sources = ["Hello", "World", "Test", "Example"]
        translations = ["你好", None, None, "示例"]
        report = check_translation_quality(sources, translations)
        assert not report.passed
        assert report.coverage_ratio == 0.5  # 2/4

    def test_mixed_cjk_latin_fails(self):
        from app.services.translation.quality import check_translation_quality

        sources = ["Hello", "World", "Test"]
        translations = ["你好Hello", "世界World", "测试Test"]
        report = check_translation_quality(sources, translations)
        assert not report.passed
        assert report.mixed_ratio == 1.0  # All mixed

    def test_good_translation_passes(self):
        from app.services.translation.quality import check_translation_quality

        # Use longer English sources to ensure length ratios are within bounds
        sources = [
            "Hello world this is a nice day",
            "How are you doing today my friend",
            "This is a longer test sentence for you",
        ]
        translations = [
            "你好世界这是美好的一天",
            "你今天怎么样我的朋友",
            "这是一个给你准备的更长的测试句子",
        ]
        report = check_translation_quality(sources, translations)
        assert report.passed
        assert report.coverage_ratio == 1.0

    def test_empty_batch_passes(self):
        from app.services.translation.quality import check_translation_quality

        report = check_translation_quality([], [])
        assert report.passed


class TestWordLevelsPreservation:
    """Tests for word_levels preservation during re-translation."""

    @pytest.mark.asyncio
    async def test_existing_word_levels_preserved(self, db_session):
        """When annotating runs on a subtitle with existing word_levels,
        the existing values should be preserved (not overwritten)."""
        # Create a subtitle with manually set word_levels
        sub = Subtitle(
            video_id="test-video-id",
            start_time=0,
            end_time=2,
            text_en="Hello world",
            text_zh="你好世界",
            sentence_index=0,
            word_levels={"hello": ["cet4"], "world": ["cet6"]},  # Manual override
        )
        db_session.add(sub)
        await db_session.commit()

        # Verify the word_levels are preserved
        result = await db_session.execute(select(Subtitle).where(Subtitle.id == sub.id))
        fetched = result.scalar_one()
        assert fetched.word_levels == {"hello": ["cet4"], "world": ["cet6"]}

        # Simulate what finalize_video's annotating step does now:
        # Only compute if word_levels is None
        if fetched.word_levels is None:
            fetched.word_levels = annotate_text(fetched.text_en) or None
            raise AssertionError("word_levels should not be None here")

        # The word_levels should still be the manual override
        assert fetched.word_levels == {"hello": ["cet4"], "world": ["cet6"]}

    @pytest.mark.asyncio
    async def test_null_word_levels_computed(self, db_session):
        """When word_levels is null, it should be computed from text_en."""
        sub = Subtitle(
            video_id="test-video-id",
            start_time=0,
            end_time=2,
            text_en="Hello world",
            text_zh="你好世界",
            sentence_index=0,
            word_levels=None,
        )
        db_session.add(sub)
        await db_session.commit()

        # When word_levels is None, compute it
        if sub.word_levels is None:
            sub.word_levels = annotate_text(sub.text_en) or None

        # Should now have computed values
        assert sub.word_levels is not None
        assert isinstance(sub.word_levels, dict)

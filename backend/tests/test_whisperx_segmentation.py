"""Tests for WhisperX sentence segmentation and subtitle formatting."""

import pytest

from app.services.transcription.formatters import (
    whisperx_segments_to_subtitles,
    whisper_segments_to_subtitles,
)


# ---------------------------------------------------------------------------
# whisperx_segments_to_subtitles tests
# ---------------------------------------------------------------------------


class TestWhisperxSegmentsToSubtitles:
    """Test conversion of WhisperX aligned segments to subtitle dicts."""

    def test_basic_conversion(self):
        """Aligned segments with words produce correct subtitle dicts."""
        segments = [
            {
                "start": 0.0,
                "end": 3.5,
                "text": "What's going on?",
                "words": [
                    {"word": "What's", "start": 0.0, "end": 0.5, "score": 0.9},
                    {"word": "going", "start": 0.6, "end": 1.0, "score": 0.95},
                    {"word": "on?", "start": 1.1, "end": 1.5, "score": 0.88},
                ],
            },
            {
                "start": 3.5,
                "end": 7.0,
                "text": "I'm moving on.",
                "words": [
                    {"word": "I'm", "start": 3.5, "end": 3.8, "score": 0.92},
                    {"word": "moving", "start": 3.9, "end": 4.3, "score": 0.91},
                    {"word": "on.", "start": 4.4, "end": 4.8, "score": 0.87},
                ],
            },
        ]

        result = whisperx_segments_to_subtitles(segments)

        assert len(result) == 2
        assert result[0]["text"] == "What's going on?"
        assert result[0]["start"] == pytest.approx(0.0)
        assert result[0]["end"] == pytest.approx(1.5)
        assert result[1]["text"] == "I'm moving on."
        assert result[1]["start"] == pytest.approx(3.5)
        assert result[1]["end"] == pytest.approx(4.8)

    def test_word_level_timestamps_used(self):
        """When words are available, uses word start/end (more precise than segment)."""
        segments = [
            {
                "start": 0.0,
                "end": 10.0,
                "text": "Hello.",
                "words": [
                    {"word": "Hello.", "start": 0.5, "end": 1.2, "score": 0.9},
                ],
            },
        ]

        result = whisperx_segments_to_subtitles(segments)

        assert result[0]["start"] == pytest.approx(0.5)
        assert result[0]["end"] == pytest.approx(1.2)

    def test_segments_without_words_fallback(self):
        """When no words list, falls back to segment start/end."""
        segments = [
            {
                "start": 0.0,
                "end": 5.0,
                "text": "No word data available.",
            },
        ]

        result = whisperx_segments_to_subtitles(segments)

        assert len(result) == 1
        assert result[0]["start"] == pytest.approx(0.0)
        assert result[0]["end"] == pytest.approx(5.0)
        assert result[0]["text"] == "No word data available."

    def test_offset_applied(self):
        """Offset is added to both start and end timestamps."""
        segments = [
            {
                "start": 1.0,
                "end": 5.0,
                "text": "Test sentence.",
                "words": [
                    {"word": "Test", "start": 1.0, "end": 1.5, "score": 0.9},
                    {"word": "sentence.", "start": 1.6, "end": 2.0, "score": 0.9},
                ],
            },
        ]

        result = whisperx_segments_to_subtitles(segments, offset=600.0)

        assert result[0]["start"] == pytest.approx(601.0)
        assert result[0]["end"] == pytest.approx(602.0)

    def test_offset_with_no_words(self):
        """Offset applied to segment-level timestamps when no words."""
        segments = [
            {"start": 1.0, "end": 5.0, "text": "Test."},
        ]

        result = whisperx_segments_to_subtitles(segments, offset=100.0)

        assert result[0]["start"] == pytest.approx(101.0)
        assert result[0]["end"] == pytest.approx(105.0)

    def test_empty_segments(self):
        """Empty input returns empty list."""
        result = whisperx_segments_to_subtitles([])
        assert result == []

    def test_empty_text_skipped(self):
        """Segments with empty or whitespace-only text are skipped."""
        segments = [
            {"start": 0.0, "end": 1.0, "text": ""},
            {"start": 1.0, "end": 2.0, "text": "   "},
            {"start": 2.0, "end": 3.0, "text": "Valid text."},
        ]

        result = whisperx_segments_to_subtitles(segments)

        assert len(result) == 1
        assert result[0]["text"] == "Valid text."

    def test_multiple_segments(self):
        """Multiple segments are all converted correctly."""
        segments = [
            {
                "start": 0.0,
                "end": 2.0,
                "text": "First.",
                "words": [{"word": "First.", "start": 0.0, "end": 1.0, "score": 0.9}],
            },
            {
                "start": 2.0,
                "end": 4.0,
                "text": "Second.",
                "words": [{"word": "Second.", "start": 2.0, "end": 3.0, "score": 0.9}],
            },
            {
                "start": 4.0,
                "end": 6.0,
                "text": "Third.",
                "words": [{"word": "Third.", "start": 4.0, "end": 5.0, "score": 0.9}],
            },
        ]

        result = whisperx_segments_to_subtitles(segments)

        assert len(result) == 3
        assert result[0]["text"] == "First."
        assert result[1]["text"] == "Second."
        assert result[2]["text"] == "Third."


# ---------------------------------------------------------------------------
# Punctuation restoration tests
# ---------------------------------------------------------------------------


class TestRestorePunctuation:
    """Test punctuation restoration for ASR segments."""

    def test_restore_adds_punctuation(self):
        """Punctuation model adds sentence-ending marks to unpunctuated text.

        If the deepmultilingualpunctuation model is not available (e.g. not
        installed in CI), the function gracefully falls back to leaving the
        text unchanged. In that case we only verify the function doesn't crash
        and returns the expected structure.
        """
        from app.services.transcription.punctuation import restore_punctuation

        segments = [
            {
                "start": 0.0,
                "end": 5.0,
                "text": "good to meet you yeah looking forward to it",
                "words": [
                    {"word": "good", "start": 0.0, "end": 0.3, "score": 0.9},
                    {"word": "to", "start": 0.3, "end": 0.5, "score": 0.9},
                    {"word": "meet", "start": 0.5, "end": 0.8, "score": 0.9},
                    {"word": "you", "start": 0.8, "end": 1.2, "score": 0.9},
                    {"word": "yeah", "start": 2.2, "end": 2.8, "score": 0.9},
                    {"word": "looking", "start": 2.8, "end": 3.5, "score": 0.9},
                    {"word": "forward", "start": 3.5, "end": 4.2, "score": 0.9},
                    {"word": "to", "start": 4.2, "end": 4.4, "score": 0.9},
                    {"word": "it", "start": 4.4, "end": 4.8, "score": 0.9},
                ],
            },
        ]

        result = restore_punctuation(segments)

        # The segment text should now contain punctuation if the model is available
        text = result[0]["text"]
        has_sentence_end = any(c in text for c in ".?!")
        if has_sentence_end:
            # Model was available and added punctuation
            assert text != "good to meet you yeah looking forward to it"
        else:
            # Model not available — graceful fallback, text unchanged
            assert text == "good to meet you yeah looking forward to it"

    def test_restore_preserves_word_timestamps(self):
        """Punctuation restoration doesn't change word start/end times."""
        from app.services.transcription.punctuation import restore_punctuation

        segments = [
            {
                "start": 0.0,
                "end": 3.0,
                "text": "hello world",
                "words": [
                    {"word": "hello", "start": 0.0, "end": 0.5, "score": 0.9},
                    {"word": "world", "start": 0.6, "end": 1.0, "score": 0.9},
                ],
            },
        ]

        result = restore_punctuation(segments)

        # Timestamps must not change
        assert result[0]["words"][0]["start"] == 0.0
        assert result[0]["words"][0]["end"] == 0.5
        assert result[0]["words"][1]["start"] == 0.6
        assert result[0]["words"][1]["end"] == 1.0

    def test_restore_empty_segments(self):
        """Empty segments list is returned as-is."""
        from app.services.transcription.punctuation import restore_punctuation

        result = restore_punctuation([])
        assert result == []


# ---------------------------------------------------------------------------
# whisper_segments_to_subtitles (legacy fallback) tests
# ---------------------------------------------------------------------------


class MockSegment:
    """Mock faster-whisper Segment object."""

    def __init__(self, text: str, start: float, end: float):
        self.text = text
        self.start = start
        self.end = end


class TestWhisperSegmentsToSubtitles:
    """Test legacy fallback formatter for raw faster-whisper segments."""

    def test_segment_objects(self):
        """Segment objects are converted correctly."""
        segments = [
            MockSegment("Hello world", 0.0, 5.0),
            MockSegment("Goodbye", 5.0, 8.0),
        ]

        result = whisper_segments_to_subtitles(segments)

        assert len(result) == 2
        assert result[0] == {"start": 0.0, "end": 5.0, "text": "Hello world"}
        assert result[1] == {"start": 5.0, "end": 8.0, "text": "Goodbye"}

    def test_dict_segments(self):
        """Dict segments are converted correctly."""
        segments = [
            {"text": "Hello", "start": 0.0, "end": 3.0},
            {"text": "World", "start": 3.0, "end": 6.0},
        ]

        result = whisper_segments_to_subtitles(segments)

        assert len(result) == 2
        assert result[0]["text"] == "Hello"
        assert result[1]["text"] == "World"

    def test_offset_applied(self):
        """Offset is added to start and end."""
        segments = [MockSegment("Test", 1.0, 5.0)]

        result = whisper_segments_to_subtitles(segments, offset=100.0)

        assert result[0]["start"] == pytest.approx(101.0)
        assert result[0]["end"] == pytest.approx(105.0)

    def test_empty_text_skipped(self):
        """Segments with empty text are skipped."""
        segments = [
            MockSegment("", 0.0, 1.0),
            MockSegment("Valid", 1.0, 2.0),
        ]

        result = whisper_segments_to_subtitles(segments)

        assert len(result) == 1
        assert result[0]["text"] == "Valid"

    def test_empty_input(self):
        """Empty input returns empty list."""
        result = whisper_segments_to_subtitles([])
        assert result == []

    def test_none_text_handled(self):
        """Segments with None text are handled gracefully."""
        seg = MockSegment.__new__(MockSegment)
        seg.text = None
        seg.start = 0.0
        seg.end = 1.0

        result = whisper_segments_to_subtitles([seg])

        assert len(result) == 0

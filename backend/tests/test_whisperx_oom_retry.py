"""Tests for WhisperX OOM retry ladder, non-sticky OOM, and fallback resegmentation.

These tests mock the engine functions + torch.cuda (CI has no GPU) and verify
the branching logic in ``transcribe_audio`` plus ``split_long_segments``.
"""

from unittest.mock import patch

import pytest

from app.services.transcription import whisper_model as wm
from app.services.transcription.formatters import split_long_segments


@pytest.fixture(autouse=True)
def _reset_whisperx_available():
    """``_whisperx_available`` is a module global and sticky across tests — reset it."""
    saved = wm._whisperx_available
    wm._whisperx_available = None
    yield
    wm._whisperx_available = saved


def _oom_error(msg: str = "CUDA out of memory. Tried to allocate 2.00 GiB") -> Exception:
    return RuntimeError(msg)


# ---------------------------------------------------------------------------
# _is_oom
# ---------------------------------------------------------------------------


class TestIsOom:
    def test_substring_match(self):
        assert wm._is_oom(RuntimeError("CUDA out of memory. Tried to allocate 2.00 GiB"))

    def test_substring_match_case_insensitive(self):
        assert wm._is_oom(RuntimeError("RuntimeError: Out Of Memory"))

    def test_non_oom_not_matched(self):
        assert not wm._is_oom(RuntimeError("align model 404 not found"))

    def test_non_oom_plain_error(self):
        assert not wm._is_oom(ValueError("bad audio path"))


# ---------------------------------------------------------------------------
# _oom_batch_ladder
# ---------------------------------------------------------------------------


class TestOomBatchLadder:
    def test_base_8(self):
        assert wm._oom_batch_ladder(8) == [8, 4, 2]

    def test_base_16(self):
        assert wm._oom_batch_ladder(16) == [16, 8, 4]

    def test_base_2_stays_min(self):
        assert wm._oom_batch_ladder(2) == [2]

    def test_base_floor_2(self):
        # base below 2 floors to 2
        assert wm._oom_batch_ladder(1)[0] >= 2


# ---------------------------------------------------------------------------
# _clear_cuda_cache
# ---------------------------------------------------------------------------


class TestClearCudaCache:
    def test_no_torch_is_noop(self):
        with patch.dict("sys.modules", {"torch": None}):
            # Should not raise even if torch can't be imported.
            wm._clear_cuda_cache()

    def test_no_cuda_is_noop(self):
        import sys
        from types import ModuleType

        fake_torch = ModuleType("torch")
        fake_cuda = ModuleType("torch.cuda")
        fake_cuda.is_available = lambda: False
        fake_cuda.empty_cache = lambda: None
        fake_torch.cuda = fake_cuda
        with patch.dict(sys.modules, {"torch": fake_torch}):
            wm._clear_cuda_cache()  # no exception


# ---------------------------------------------------------------------------
# transcribe_audio retry + sticky policy
# ---------------------------------------------------------------------------


class TestTranscribeAudioRetry:
    def _settings(self, monkeypatch, engine="whisperx", batch=8):
        from app.core.config import get_settings

        monkeypatch.setattr(get_settings(), "whisper_engine", engine, raising=False)
        # whisperx_batch_size is read inside transcribe_audio via get_settings().
        monkeypatch.setattr(type(get_settings()), "whisperx_batch_size", batch, raising=False)

    def test_oom_retries_then_succeeds_no_sticky(self, monkeypatch):
        """OOM on batch=8 and 4, success on 2 — no sticky disable, returns WhisperX result."""
        self._settings(monkeypatch, batch=8)
        calls: list[int] = []

        def fake_whisperx(path, batch_size=None):
            calls.append(batch_size)
            if batch_size > 2:
                raise _oom_error()
            return [{"start": 0, "end": 1, "text": "ok", "words": []}]

        with (
            patch.object(wm, "_whisperx_usable", return_value=True),
            patch.object(wm, "transcribe_with_whisperx", side_effect=fake_whisperx),
            patch.object(wm, "_clear_cuda_cache") as cleared,
            patch.object(wm, "_disable_whisperx_runtime") as disabled,
            patch.object(wm, "transcribe_with_faster_whisper") as fw,
        ):
            result = wm.transcribe_audio("x.wav")

        assert calls == [8, 4, 2]  # ladder exhausted in order
        assert result[0]["text"] == "ok"
        fw.assert_not_called()  # never fell back
        disabled.assert_not_called()  # OOM is NOT sticky
        assert cleared.call_count == 2  # cleared between the two OOM retries

    def test_oom_exhausted_falls_back_no_sticky(self, monkeypatch):
        """All ladder attempts OOM → fall back to faster-whisper, but NOT sticky."""
        self._settings(monkeypatch, batch=8)

        def always_oom(path, batch_size=None):
            raise _oom_error()

        with (
            patch.object(wm, "_whisperx_usable", return_value=True),
            patch.object(wm, "transcribe_with_whisperx", side_effect=always_oom),
            patch.object(wm, "transcribe_with_faster_whisper", return_value=[{"fw": True}]),
            patch.object(wm, "_disable_whisperx_runtime") as disabled,
        ):
            result = wm.transcribe_audio("x.wav")

        assert result == [{"fw": True}]
        # OOM exhausted must NOT poison subsequent chunks.
        disabled.assert_not_called()

    def test_non_oom_falls_back_and_is_sticky(self, monkeypatch):
        """A non-OOM hard failure → fall back AND sticky disable."""
        self._settings(monkeypatch, batch=8)

        def hard_fail(path, batch_size=None):
            raise RuntimeError("align model download 404")

        with (
            patch.object(wm, "_whisperx_usable", return_value=True),
            patch.object(wm, "transcribe_with_whisperx", side_effect=hard_fail),
            patch.object(wm, "transcribe_with_faster_whisper", return_value=[{"fw": True}]),
            patch.object(wm, "_disable_whisperx_runtime") as disabled,
        ):
            result = wm.transcribe_audio("x.wav")

        assert result == [{"fw": True}]
        disabled.assert_called_once()  # non-OOM IS sticky
        # And it was called only once (no retry ladder for non-OOM).

    def test_engine_faster_whisper_skips_whisperx(self, monkeypatch):
        """whisper_engine='faster_whisper' goes straight to faster-whisper."""
        self._settings(monkeypatch, engine="faster_whisper")
        with (
            patch.object(wm, "transcribe_with_whisperx") as wx,
            patch.object(wm, "transcribe_with_faster_whisper", return_value=[{"fw": True}]),
        ):
            result = wm.transcribe_audio("x.wav")
        assert result == [{"fw": True}]
        wx.assert_not_called()


# ---------------------------------------------------------------------------
# split_long_segments
# ---------------------------------------------------------------------------


def _word(text: str, start: float, end: float) -> dict:
    return {"word": text, "start": start, "end": end, "score": 1.0}


class TestSplitLongSegments:
    def test_short_segment_unchanged(self):
        seg = {"start": 0.0, "end": 5.0, "text": "hello world", "words": [_word("hello", 0, 1), _word("world", 1, 5)]}
        out = split_long_segments([seg], max_duration=12.0)
        assert out == [seg]

    def test_split_on_sentence_boundary(self):
        # 30s segment with two sentences split by a period.
        seg = {
            "start": 0.0,
            "end": 30.0,
            "text": "first sentence. second sentence",
            "words": [
                _word("first", 0, 1),
                _word("sentence.", 1, 15),
                _word("second", 15, 16),
                _word("sentence", 16, 30),
            ],
        }
        out = split_long_segments([seg], max_duration=12.0)
        assert len(out) == 2
        assert out[0]["words"][-1]["word"].endswith(".")
        assert out[0]["end"] <= 15 + 0.001
        assert out[1]["start"] >= 15 - 0.001

    def test_no_words_returned_as_is(self):
        """Without word timestamps we can't reassign boundaries — return unchanged."""
        seg = {"start": 0.0, "end": 29.0, "text": "a long segment with no words", "words": []}
        out = split_long_segments([seg], max_duration=12.0)
        assert out == [seg]

    def test_no_punctuation_long_segment_force_split(self):
        """No sentence/clause punctuation → force-split by word count so no 29s line."""
        words = [_word(f"w{i}", i * 1.0, i * 1.0 + 1.0) for i in range(20)]  # 20s, no punctuation
        seg = {"start": 0.0, "end": 20.0, "text": " ".join(w["word"] for w in words), "words": words}
        out = split_long_segments([seg], max_duration=12.0)
        assert len(out) >= 2
        # No sub-segment should exceed the original end.
        for sub in out:
            assert sub["end"] <= 20.0 + 0.001
            assert sub["start"] >= 0.0 - 0.001

    def test_output_shape_preserved(self):
        """Each output segment has the {start,end,text,words} shape."""
        words = [_word(f"w{i}.", i * 2.0, i * 2.0 + 1.0) for i in range(8)]  # 16s, sentence-ended
        seg = {"start": 0.0, "end": 16.0, "text": "x", "words": words}
        out = split_long_segments([seg], max_duration=12.0)
        for sub in out:
            assert set(sub.keys()) == {"start", "end", "text", "words"}
            assert isinstance(sub["words"], list)

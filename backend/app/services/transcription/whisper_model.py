"""WhisperX model management — lazy-loaded singletons with CUDA auto-detection.

Provides two model singletons:
- get_whisperx_model(): WhisperX ASR pipeline (VAD + batched faster-whisper)
- get_align_model(): wav2vec2 forced-alignment model for word-level timestamps

Also keeps the legacy get_whisper_model() for speaking_service.py, which
needs fast, lightweight transcription of short audio clips without alignment.
"""

from functools import lru_cache
from threading import Lock

import structlog

logger = structlog.get_logger()

# --- WhisperX ASR model singleton ---
_whisperx_model = None
_whisperx_lock = Lock()

# --- Alignment model cache (per language) ---
_align_models: dict[str, tuple] = {}  # language_code -> (model, metadata)
_align_lock = Lock()

# --- Legacy faster-whisper model singleton (for speaking_service) ---
_whisper_model = None
_whisper_lock = Lock()

# --- ASR faster-whisper model singleton (for the faster-whisper fallback) ---
_asr_whisper_model = None
_asr_whisper_lock = Lock()

# --- WhisperX availability: None=unprobed, True=loaded ok, False=unavailable ---
# Cached so a failing WhisperX load isn't re-attempted on every chunk, and a
# runtime transcription failure sticks (all subsequent chunks fall back too, so
# one video never mixes WhisperX sentence-segmented and faster-whisper
# segment-level subtitles).
_whisperx_available: bool | None = None
_whisperx_avail_lock = Lock()


@lru_cache(maxsize=1)
def _detect_device() -> tuple[str, str]:
    """Auto-detect compute device and type.

    Memoized: device/compute depend only on settings + hardware, both constant
    for the process lifetime, so the torch CUDA probe runs once.

    Returns:
        (device, compute_type) tuple, e.g. ("cuda", "float16") or ("cpu", "int8").
    """
    from app.core.config import get_settings

    settings = get_settings()
    device = settings.whisper_device
    compute_type = settings.whisper_compute_type

    if device == "auto":
        try:
            import torch

            if torch.cuda.is_available():
                device = "cuda"
                compute_type = "float16"
                logger.info("CUDA device detected", device_name=torch.cuda.get_device_name(0))
            else:
                device = "cpu"
                compute_type = "int8"
                logger.info("CUDA not available, using CPU (int8)")
        except ImportError:
            device = "cpu"
            compute_type = "int8"
            logger.info("torch not installed, using CPU (int8)")

    return device, compute_type


def get_whisperx_model():
    """Lazy-load the WhisperX ASR model with VAD.

    Returns a FasterWhisperPipeline (wraps faster_whisper.WhisperModel
    with batched inference and VAD preprocessing).

    Uses the same singleton pattern as the old whisper_model.py:
    double-checked locking for thread-safe lazy initialization.
    """
    global _whisperx_model
    if _whisperx_model is not None:
        return _whisperx_model

    with _whisperx_lock:
        if _whisperx_model is not None:
            return _whisperx_model

        try:
            import whisperx
        except ImportError as exc:
            raise RuntimeError("whisperx is not installed. Install it with: pip install whisperx") from exc

        from app.core.config import get_settings

        settings = get_settings()
        # whisperx_model (empty) reuses whisper_model_path — a CTranslate2 dir
        # usable by both WhisperX and faster-whisper.
        model_path = settings.whisperx_model or settings.whisper_model_path
        device, compute_type = _detect_device()
        # Compute resolution: _detect_device() derives from whisper_device
        # (float16 on cuda, int8 on cpu) using whisper_compute_type as the base
        # when device is explicit. whisperx_compute_type (if set) overrides that
        # for WhisperX only — useful when the two engines need different types.
        if settings.whisperx_compute_type:
            compute_type = settings.whisperx_compute_type
        # Empty language = auto-detect per audio (handles non-English content);
        # a set value (e.g. "en") forces it and skips detection.
        language = settings.whisper_language or None

        logger.info(
            "Loading WhisperX ASR model",
            path=model_path,
            device=device,
            compute=compute_type,
            vad=settings.whisperx_vad_method,
            language=language or "auto",
        )

        try:
            _whisperx_model = whisperx.load_model(
                model_path,
                device=device,
                compute_type=compute_type,
                language=language,
                asr_options={
                    "beam_size": 5,
                    "condition_on_previous_text": False,
                },
                vad_method=settings.whisperx_vad_method,
            )
            logger.info("WhisperX ASR model loaded successfully")
        except Exception:
            logger.error("Failed to load WhisperX ASR model", device=device, exc_info=True)
            # Fallback to CPU
            if device == "cuda":
                logger.info("Falling back to CPU (int8)")
                _whisperx_model = whisperx.load_model(
                    model_path,
                    device="cpu",
                    compute_type="int8",
                    language=language,
                    asr_options={
                        "beam_size": 5,
                        "condition_on_previous_text": False,
                    },
                    vad_method=settings.whisperx_vad_method,
                )
            else:
                raise

    return _whisperx_model


def get_align_model(language_code: str = "en"):
    """Lazy-load alignment model for forced alignment.

    The alignment model (wav2vec2) provides precise word-level timestamps
    and sentence segmentation via NLTK Punkt.

    Args:
        language_code: ISO language code (e.g. "en", "fr", "de").
            Defaults to "en".

    Returns:
        tuple: (align_model, align_metadata) for use with whisperx.align().
    """
    if language_code in _align_models:
        return _align_models[language_code]

    with _align_lock:
        if language_code in _align_models:
            return _align_models[language_code]

        import whisperx

        from app.core.config import get_settings

        settings = get_settings()
        device, _ = _detect_device()
        model_name = settings.whisperx_align_model or None

        logger.info(
            "Loading alignment model",
            language=language_code,
            device=device,
            model=model_name or "auto",
        )

        # [Phase3 诊断] load_align_model 首次会从 HuggingFace 下载 wav2vec2 (~360MB),
        model_a, metadata = whisperx.load_align_model(
            language_code=language_code,
            device=device,
            model_name=model_name,
        )
        _align_models[language_code] = (model_a, metadata)
        logger.info("Alignment model loaded", language=language_code)
        return model_a, metadata


def release_whisperx_models():
    """Release all WhisperX models and free GPU memory.

    Call this on application shutdown or when you need to free resources.
    """
    global _whisperx_model, _align_models

    if _whisperx_model is not None:
        del _whisperx_model
        _whisperx_model = None

    _align_models.clear()

    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.info("GPU memory cleared")
    except Exception:
        pass

    logger.info("WhisperX models released")


# ---------------------------------------------------------------------------
# Engine dispatch: WhisperX (VAD + forced alignment) with faster-whisper fallback
# ---------------------------------------------------------------------------


def _is_oom(exc: BaseException) -> bool:
    """True if ``exc`` looks like a CUDA / CTranslate2 out-of-memory error.

    WhisperX's underlying CTranslate2 raises ``RuntimeError("...out of memory...")``
    rather than ``torch.cuda.OutOfMemoryError``, so match on the message text
    first; the isinstance check is a guarded bonus for newer PyTorch.
    """
    msg = f"{exc}".lower()
    if "out of memory" in msg or "out of memory" in repr(exc).lower():
        return True
    try:
        import torch

        return isinstance(exc, torch.cuda.OutOfMemoryError)
    except Exception:
        return False


def _clear_cuda_cache() -> None:
    """Defragment the CUDA caching allocator without releasing resident models.

    Called between OOM retries and between chunks so a singleton model can still
    obtain a contiguous batch block. Does NOT ``del`` models — reload is costlier
    and may itself OOM. No-op on CPU / when torch is absent.
    """
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def _oom_batch_ladder(base: int) -> list[int]:
    """Batch sizes to try when recovering from OOM: [base, base//2, base//4].

    Floor of 2 so the final attempt still batches. For default base=8 → [8, 4, 2].
    """
    ladder: list[int] = []
    cur = max(2, base)
    seen: set[int] = set()
    for _ in range(3):
        cur = max(2, cur)
        if cur not in seen:
            ladder.append(cur)
            seen.add(cur)
        if cur <= 2:
            break
        cur //= 2
    return ladder or [2]


def transcribe_with_whisperx(audio_path: str, batch_size: int | None = None) -> list[dict]:
    """Transcribe + align with WhisperX. Returns aligned segment dicts.

    Pipeline: ASR (VAD + batched) → punctuation restoration → wav2vec2 align.
    Raises on failure so the caller can fall back to faster-whisper.

    ``batch_size`` overrides ``settings.whisperx_batch_size`` for this call —
    used by the OOM retry ladder in :func:`transcribe_audio` to shrink the
    activation footprint and recover from transient CUDA OOM without degrading
    to faster-whisper.
    """
    import whisperx

    from app.core.config import get_settings

    settings = get_settings()

    audio = whisperx.load_audio(audio_path)

    # Step 1: ASR with VAD + batched inference
    model = get_whisperx_model()
    effective_batch = batch_size or settings.whisperx_batch_size
    result = model.transcribe(audio, batch_size=effective_batch)
    language = result.get("language", "en")
    logger.info(
        "WhisperX ASR complete", language=language, segment_count=len(result["segments"]), batch_size=effective_batch
    )

    # Step 2: Restore punctuation before alignment. A no-op on turbo models
    # (which emit punctuation natively) but required for small/base models whose
    # raw output lacks punctuation (NLTK Punkt in align() can't split sentences
    # without it). Disable via whisper_punctuation_restore=False on turbo to
    # skip the model load + ~2s/chunk prediction. Default on (safe for base).
    if settings.whisper_punctuation_restore:
        from .punctuation import restore_punctuation

        result["segments"] = restore_punctuation(result["segments"])

    # Step 3: Forced alignment for word-level timestamps + sentence segmentation
    model_a, metadata = get_align_model(language)
    device, _ = _detect_device()
    result = whisperx.align(result["segments"], model_a, metadata, audio, device)

    # Failsafe segmentation: if punctuation restoration was skipped or failed
    # (so align()'s NLTK Punkt couldn't split sentences), split_long_segments
    # force-splits any segment still over ~12s by word count. merge_short_segments
    # then folds lone-word fragments (VAD-isolated utterances or mis-flagged
    # sentence finals) into the prior segment. Together these prevent the
    # "one giant segment" and "single-word segment" pathologies even when the
    # punctuation model is unavailable.
    from .formatters import merge_short_segments, split_long_segments

    result["segments"] = split_long_segments(result["segments"], max_duration=12.0)
    result["segments"] = merge_short_segments(result["segments"])
    logger.info("WhisperX aligned", segment_count=len(result["segments"]))

    return result["segments"]


def transcribe_with_faster_whisper(audio_path: str) -> list[dict]:
    """Transcribe with raw faster-whisper (no VAD, no alignment).

    Lightweight fallback used when WhisperX is unavailable or disabled. Loads
    the faster-whisper model at the same path the primary WhisperX engine uses
    (``whisperx_model or whisper_model_path``) so the fallback doesn't silently
    drop to a different (e.g. ``base``) model.

    Returns dict-shaped segments compatible with whisperx_segments_to_subtitles;
    word-level timestamps are extracted so the formatter can tighten subtitle
    boundaries (it falls back to segment start/end when words are absent).
    """
    from app.core.config import get_settings

    from .formatters import faster_whisper_segments_to_dicts

    model = get_asr_whisper_model()
    language = get_settings().whisper_language or None
    segments, _ = model.transcribe(
        audio_path,
        beam_size=5,
        word_timestamps=True,
        condition_on_previous_text=False,
        language=language,
    )
    out = faster_whisper_segments_to_dicts(segments)

    # Fallback path used to skip punctuation + alignment, emitting raw ~30s
    # Whisper segment windows as giant unsegmented subtitle lines. Restore
    # punctuation (same model WhisperX uses) then split long segments on
    # sentence boundaries so the fallback never produces 29s subtitle lines.
    settings = get_settings()
    if settings.whisper_punctuation_restore:
        from .punctuation import restore_punctuation

        out = restore_punctuation(out)
    from .formatters import merge_short_segments, split_long_segments

    out = split_long_segments(out, max_duration=12.0)
    out = merge_short_segments(out)
    logger.info("faster-whisper transcription complete", segment_count=len(out))
    return out


def _whisperx_usable() -> bool:
    """True if the WhisperX engine should be used for this process.

    Resolved once and cached: probes ``get_whisperx_model()`` (the expensive
    load) so a failing load isn't re-attempted per chunk, and a later runtime
    transcription failure flips the cache to False (sticky) so the rest of a
    chunked job stays on faster-whisper instead of mixing granularities.
    Respects ``whisper_engine`` so tests/config changes that select
    ``faster_whisper`` skip the probe entirely.
    """
    global _whisperx_available
    if _whisperx_available is not None:
        return _whisperx_available
    with _whisperx_avail_lock:
        if _whisperx_available is not None:
            return _whisperx_available
        try:
            get_whisperx_model()
            _whisperx_available = True
        except Exception as exc:
            logger.warning(
                "WhisperX unavailable, using faster-whisper for this process",
                error=str(exc),
            )
            _whisperx_available = False
        return _whisperx_available


def _disable_whisperx_runtime(reason: str) -> None:
    """Mark WhisperX unusable for the rest of the process (sticky fallback)."""
    global _whisperx_available
    if _whisperx_available is not False:
        logger.warning("Switching process to faster-whisper (sticky): %s", reason)
    _whisperx_available = False


def transcribe_audio(audio_path: str) -> list[dict]:
    """Dispatch transcription by configured engine, with OOM-aware WhisperX retries.

    When ``whisper_engine == "whisperx"`` and WhisperX hits a CUDA OOM, retry
    with a shrinking batch size (``[base, base//2, base//4]``) after clearing the
    CUDA cache — most OOM is fragmentation that a smaller batch + empty_cache
    fixes, so we avoid degrading to faster-whisper (which skips alignment and
    emits giant unsegmented lines). Only after the ladder is exhausted, or on a
    non-OOM hard failure, do we fall back to faster-whisper.

    Sticky policy: a non-OOM hard failure (broken align model, corrupt weights)
    marks WhisperX unusable for the rest of the process so we don't re-try a
    known-broken path every chunk. An OOM is **not** sticky — it's transient, so
    each chunk independently retries WhisperX with the full ladder.
    """
    from app.core.config import get_settings

    settings = get_settings()

    if settings.whisper_engine == "faster_whisper" or not _whisperx_usable():
        return transcribe_with_faster_whisper(audio_path)

    ladder = _oom_batch_ladder(settings.whisperx_batch_size)
    for attempt, batch_size in enumerate(ladder):
        try:
            return transcribe_with_whisperx(audio_path, batch_size=batch_size)
        except Exception as exc:
            oom = _is_oom(exc)
            if oom and attempt < len(ladder) - 1:
                logger.warning(
                    "WhisperX OOM, retrying with smaller batch",
                    batch_size=batch_size,
                    next_batch_size=ladder[attempt + 1],
                    error=str(exc),
                )
                _clear_cuda_cache()
                continue
            logger.warning(
                "WhisperX failed, falling back to faster-whisper",
                error=str(exc),
                oom=oom,
                attempts=attempt + 1,
            )
            # OOM is transient — don't poison subsequent chunks. Only a non-OOM
            # hard failure is sticky (avoid re-trying a known-broken path).
            if not oom:
                _disable_whisperx_runtime(str(exc))
            return transcribe_with_faster_whisper(audio_path)

    # Unreachable: the loop always returns, but keep a safe fallback.
    return transcribe_with_faster_whisper(audio_path)


# ---------------------------------------------------------------------------
# Legacy faster-whisper model (for speaking_service.py)
# ---------------------------------------------------------------------------


def get_whisper_model():
    """Lazy-load the raw faster-whisper model (legacy, for speaking practice).

    Speaking practice needs fast, lightweight transcription of short audio
    clips (a few seconds). The full WhisperX pipeline (VAD + align) is
    overkill and would add latency. This function provides the original
    faster-whisper-only path.
    """
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model

    with _whisper_lock:
        if _whisper_model is not None:
            return _whisper_model

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError("faster-whisper is not installed. Install it with: pip install faster-whisper") from exc

        from app.core.config import get_settings

        settings = get_settings()
        model_path = settings.whisper_model_path
        device, compute_type = _detect_device()

        logger.info(
            "Loading legacy Whisper model",
            path=model_path,
            device=device,
            compute=compute_type,
        )

        try:
            _whisper_model = WhisperModel(
                model_path,
                device=device,
                compute_type=compute_type,
            )
        except Exception:
            logger.error("Failed to load Whisper model", device=device, exc_info=True)
            if device == "cuda":
                logger.info("Falling back to CPU (int8)")
                _whisper_model = WhisperModel(
                    model_path,
                    device="cpu",
                    compute_type="int8",
                )
            else:
                raise

    return _whisper_model


def _asr_model_path() -> str:
    """Resolve the ASR model path shared by both engines.

    ``whisperx_model`` (if set) wins; otherwise fall back to
    ``whisper_model_path``. WhisperX and the faster-whisper fallback must load
    the same model so the fallback doesn't silently transcribe with a
    different (e.g. ``base``) model than the primary engine.
    """
    from app.core.config import get_settings

    s = get_settings()
    return s.whisperx_model or s.whisper_model_path


def get_asr_whisper_model():
    """Lazy-load faster-whisper at the resolved ASR path (for the fallback engine).

    When the resolved path equals ``whisper_model_path`` (the common case where
    ``whisperx_model`` is empty), reuses the legacy speaking-practice singleton
    so we don't hold two copies of the same model in memory. Only when
    ``whisperx_model`` points elsewhere do we load a separate instance.
    """
    global _asr_whisper_model
    from app.core.config import get_settings

    path = _asr_model_path()
    if path == get_settings().whisper_model_path:
        return get_whisper_model()

    if _asr_whisper_model is not None:
        return _asr_whisper_model

    with _asr_whisper_lock:
        if _asr_whisper_model is not None:
            return _asr_whisper_model

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError("faster-whisper is not installed. Install it with: pip install faster-whisper") from exc

        device, compute_type = _detect_device()
        logger.info("Loading ASR faster-whisper model (fallback)", path=path, device=device, compute=compute_type)
        try:
            _asr_whisper_model = WhisperModel(path, device=device, compute_type=compute_type)
            logger.info("ASR faster-whisper model loaded successfully")
        except Exception:
            logger.error("Failed to load ASR faster-whisper model", device=device, exc_info=True)
            if device == "cuda":
                logger.info("Falling back to CPU (int8)")
                _asr_whisper_model = WhisperModel(path, device="cpu", compute_type="int8")
            else:
                raise

    return _asr_whisper_model


def release_whisper_model():
    """Release the legacy Whisper model and free GPU memory."""
    global _whisper_model
    if _whisper_model is not None:
        del _whisper_model
        _whisper_model = None
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.info("GPU memory cleared (legacy model)")
        except Exception:
            pass
        logger.info("Legacy Whisper model released")

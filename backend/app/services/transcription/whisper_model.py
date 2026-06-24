"""WhisperX model management — lazy-loaded singletons with CUDA auto-detection.

Provides two model singletons:
- get_whisperx_model(): WhisperX ASR pipeline (VAD + batched faster-whisper)
- get_align_model(): wav2vec2 forced-alignment model for word-level timestamps

Also keeps the legacy get_whisper_model() for speaking_service.py, which
needs fast, lightweight transcription of short audio clips without alignment.
"""

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


def _detect_device() -> tuple[str, str]:
    """Auto-detect compute device and type.

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
        # Explicit whisperx_compute_type overrides the auto-derived value.
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


def transcribe_with_whisperx(audio_path: str) -> list[dict]:
    """Transcribe + align with WhisperX. Returns aligned segment dicts.

    Pipeline: ASR (VAD + batched) → punctuation restoration → wav2vec2 align.
    Raises on failure so the caller can fall back to faster-whisper.
    """
    import whisperx

    from .punctuation import restore_punctuation

    audio = whisperx.load_audio(audio_path)

    # Step 1: ASR with VAD + batched inference
    model = get_whisperx_model()
    result = model.transcribe(audio, batch_size=_whisperx_batch_size())
    language = result.get("language", "en")
    logger.info("WhisperX ASR complete", language=language, segment_count=len(result["segments"]))

    # Step 2: Restore punctuation (no-op on turbo models; kept for small/Chinese models)
    result["segments"] = restore_punctuation(result["segments"])

    # Step 3: Forced alignment for word-level timestamps + sentence segmentation
    model_a, metadata = get_align_model(language)
    device, _ = _detect_device()
    result = whisperx.align(result["segments"], model_a, metadata, audio, device)
    logger.info("WhisperX aligned", segment_count=len(result["segments"]))

    return result["segments"]


def transcribe_with_faster_whisper(audio_path: str) -> list[dict]:
    """Transcribe with raw faster-whisper (no VAD, no alignment).

    Lightweight fallback used when WhisperX is unavailable or disabled.
    Returns dict-shaped segments compatible with whisperx_segments_to_subtitles
    (no word-level timestamps; formatter falls back to segment start/end).
    """
    model = get_whisper_model()
    language = _whisper_language()
    segments, _ = model.transcribe(
        audio_path,
        beam_size=5,
        word_timestamps=True,
        condition_on_previous_text=False,
        language=language or None,
    )
    out = []
    for seg in segments:
        words = [
            {"word": w.word.strip(), "start": float(w.start), "end": float(w.end), "score": float(getattr(w, "probability", 0.0))}
            for w in (getattr(seg, "words", None) or [])
        ]
        out.append({
            "start": float(seg.start),
            "end": float(seg.end),
            "text": (seg.text or "").strip(),
            "words": words,
        })
    logger.info("faster-whisper transcription complete", segment_count=len(out))
    return out


def transcribe_audio(audio_path: str) -> list[dict]:
    """Dispatch transcription by configured engine, with WhisperX → faster-whisper fallback.

    Returns aligned/segmented dicts. When ``whisper_engine == "whisperx"`` and
    WhisperX fails (model load, alignment, etc.), automatically retries with
    faster-whisper so transcription never hard-fails on engine issues.
    """
    from app.core.config import get_settings

    settings = get_settings()
    engine = settings.whisper_engine

    if engine == "faster_whisper":
        return transcribe_with_faster_whisper(audio_path)

    # Default: whisperx, with fallback on failure.
    try:
        return transcribe_with_whisperx(audio_path)
    except Exception as exc:
        logger.warning(
            "WhisperX transcription failed, falling back to faster-whisper",
            error=str(exc),
        )
        return transcribe_with_faster_whisper(audio_path)


def _whisperx_batch_size() -> int:
    from app.core.config import get_settings
    return get_settings().whisperx_batch_size


def _whisper_language():
    from app.core.config import get_settings
    return get_settings().whisper_language or None


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
            logger.info("Legacy Whisper model loaded successfully")
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

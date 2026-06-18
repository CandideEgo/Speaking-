"""WhisperX model management — lazy-loaded singletons with CUDA auto-detection.

Provides two model singletons:
- get_whisperx_model(): WhisperX ASR pipeline (VAD + batched faster-whisper)
- get_align_model(): wav2vec2 forced-alignment model for word-level timestamps

Also keeps the legacy get_whisper_model() for speaking_service.py, which
needs fast, lightweight transcription of short audio clips without alignment.
"""

import structlog
from threading import Lock

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
            raise RuntimeError(
                "whisperx is not installed. "
                "Install it with: pip install whisperx"
            ) from exc

        from app.core.config import get_settings

        settings = get_settings()
        model_path = settings.whisper_model_path
        device, compute_type = _detect_device()

        logger.info(
            "Loading WhisperX ASR model",
            path=model_path,
            device=device,
            compute=compute_type,
            vad=settings.whisperx_vad_method,
        )

        try:
            _whisperx_model = whisperx.load_model(
                model_path,
                device=device,
                compute_type=compute_type,
                language="en",
                asr_options={
                    "beam_size": 5,
                    "condition_on_previous_text": False,
                },
                vad_method=settings.whisperx_vad_method,
            )
            logger.info("WhisperX ASR model loaded successfully")
        except Exception as e:
            logger.error("Failed to load WhisperX ASR model", device=device, exc_info=True)
            # Fallback to CPU
            if device == "cuda":
                logger.info("Falling back to CPU (int8)")
                _whisperx_model = whisperx.load_model(
                    model_path,
                    device="cpu",
                    compute_type="int8",
                    language="en",
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
            raise RuntimeError(
                "faster-whisper is not installed. "
                "Install it with: pip install faster-whisper"
            ) from exc

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
        except Exception as e:
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

"""Whisper model management — lazy-loaded singleton with CUDA auto-detection.

Replaces the model loading in speaking_service.py to avoid duplicate model instances.
"""

import logging
from threading import Lock

logger = logging.getLogger(__name__)

_whisper_model = None
_whisper_lock = Lock()


def get_whisper_model():
    """Lazy-load the faster-whisper model with graceful CUDA fallback.

    Returns a WhisperModel instance.  The model is cached process-wide so
    multiple transcription tasks share the same instance.
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

        # Auto-detect device
        device = settings.whisper_device
        compute_type = settings.whisper_compute_type

        if device == "auto":
            try:
                import torch
                if torch.cuda.is_available():
                    device = "cuda"
                    compute_type = "float16"
                    logger.info(f"[CUDA] Using {torch.cuda.get_device_name(0)}")
                else:
                    device = "cpu"
                    compute_type = "int8"
                    logger.info("[CPU] CUDA not available, using CPU (int8)")
            except ImportError:
                device = "cpu"
                compute_type = "int8"
                logger.info("[CPU] torch not installed, using CPU (int8)")

        logger.info(f"Loading Whisper model: path={model_path}, device={device}, compute={compute_type}")

        try:
            _whisper_model = WhisperModel(
                model_path,
                device=device,
                compute_type=compute_type,
            )
            logger.info("Whisper model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Whisper model on {device}: {e}")
            # Fallback to CPU
            if device == "cuda":
                logger.info("Falling back to CPU (int8)")
                _whisper_model = WhisperModel(
                    model_path,
                    device="cpu",
                    compute_type="int8",
                )
            else:
                raise ModelLoadError(f"Failed to load Whisper model: {e}") from e

    return _whisper_model


def release_whisper_model():
    """Release the Whisper model and free GPU memory.

    Call this on application shutdown or when you need to free resources.
    """
    global _whisper_model
    if _whisper_model is not None:
        del _whisper_model
        _whisper_model = None
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.info("GPU memory cleared")
        except Exception:
            pass
        logger.info("Whisper model released")

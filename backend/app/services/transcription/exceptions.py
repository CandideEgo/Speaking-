"""Transcription exceptions."""


class TranscriptionError(Exception):
    """Base exception for transcription failures."""

    pass


class AudioExtractionError(TranscriptionError):
    """Failed to extract audio from video."""

    pass


class ModelLoadError(TranscriptionError):
    """Failed to load Whisper model."""

    pass


class UnsupportedPlatformError(TranscriptionError):
    """Platform is not supported for transcription."""

    pass

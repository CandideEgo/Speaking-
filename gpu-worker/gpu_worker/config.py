"""GPU worker settings — the subset of the cloud ``Settings`` this machine needs.

Deliberately does NOT carry the cloud's web/DB/OSS/SMS/LLM fields: the GPU
worker has no database, no object storage and no API surface. Field names and
defaults match ``backend/app/core/config.py`` for the overlapping keys, so the
values in ``.env.gpu-worker`` are the same ``KEY=value`` spellings the cloud
uses (env names are the uppercased field names).

The env file is read from the CURRENT WORKING DIRECTORY (pydantic-settings
semantics), which is why ``scripts/run_gpu_worker.ps1`` does ``Set-Location``
to the ``gpu-worker/`` root before launching. Real environment variables win
over the file, so the launcher's ``Get-Content``/``Set-Item Env:`` loop and
NSSM's environment both work.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """GPU worker configuration (env names = uppercased field names)."""

    env: str = "development"
    log_level: str = "INFO"

    # --- Broker (cloud Redis, normally reached through the SSH tunnel) ---
    redis_url: str = "redis://localhost:6379/0"
    transcription_gpu_queue_name: str = "transcription_gpu"

    # --- Callback back to the cloud (the worker's only output channel) ---
    transcription_callback_url: str = ""
    transcription_callback_secret: str = ""
    transcription_callback_timeout: int = 30
    transcription_callback_max_retries: int = 5

    # --- Whisper / WhisperX ---
    whisper_model_path: str = "base"
    whisperx_model: str = ""
    whisperx_batch_size: int = 8
    whisper_chunk_duration: float = 600.0
    whisper_max_concurrent_chunks: int = 2
    whisper_device: str = "auto"
    whisper_compute_type: str = "int8"
    whisperx_vad_method: str = "silero"
    whisperx_align_model: str = ""
    whisper_language: str = ""
    whisper_engine: str = "whisperx"
    whisperx_compute_type: str = ""
    whisper_punctuation_restore: bool = True
    transcription_temp_dir: str = "./media/transcription_temp"

    # --- Media fetching (yt-dlp / OSS signed URL download) ---
    http_proxy: str = ""
    youtube_cookies_path: str = ""
    # POT provider (bgutil) on the GPU box. Must be given explicitly: the plugin
    # otherwise dials its own 127.0.0.1:4416 default, which goes through
    # http_proxy and can't reach the host loopback (20s read timeouts, 2026-09-08).
    # Kept identical to backend/app/core/config.py's default.
    youtube_pot_base_url: str = "http://127.0.0.1:4416"

    # --- Alerting (out-of-band webhook; unset = log only, no DB fallback) ---
    alert_webhook_url: str = ""
    alert_webhook_secret: str = ""

    model_config = SettingsConfigDict(
        env_file=".env.gpu-worker",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide settings singleton (cached like the cloud's)."""
    return Settings()

from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "Speaking"
    debug: bool = False

    database_url: str = ""
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = ""
    env: str = "development"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    jwt_blacklist_enabled: bool = True  # Set False to skip Redis blacklist checks

    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = "gpt-4o"

    # Translation engine (pluggable) — hy_mt2 | qwen | agnes | custom
    translation_engine: str = "agnes"           # active translation engine
    translation_fallback_engine: str = ""       # optional fallback on primary failure
    translation_batch_size: int = 20            # subtitles per LLM call
    translation_hymt2_api_key: str = ""         # Hy-MT2-7B (iFLYTEK)
    translation_qwen_api_key: str = ""          # Qwen3.6-35B (iFLYTEK)
    translation_custom_base_url: str = ""       # Custom OpenAI-compatible endpoint
    translation_custom_api_key: str = ""        # Custom endpoint API key
    translation_custom_model: str = ""          # Custom endpoint model name

    local_media_path: str = "./media"

    oss_endpoint: str = ""
    oss_bucket: str = ""
    oss_access_key: str = ""
    oss_secret_key: str = ""
    oss_cdn_domain: str = ""  # e.g. "cdn.speaking-app.com"
    oss_upload_enabled: bool = False  # Set True to upload transcoded videos to OSS
    oss_prefix: str = "videos/"  # Path prefix in bucket
    oss_cleanup_local: bool = False  # Delete local transcoded files after successful OSS upload

    # Payment configuration
    alipay_app_id: str = ""
    alipay_public_key: str = ""
    alipay_private_key: str = ""
    wechat_mch_id: str = ""
    wechat_api_v3_key: str = ""
    wechat_serial_no: str = ""
    payment_verify_signature: bool = False

    # Proxy for external services (yt-dlp, AI)
    http_proxy: str = ""  # e.g. http://172.25.176.1:7897
    youtube_cookies_path: str = ""  # e.g. ./youtube_cookies.txt

    # YouTube Data API v3 for comment extraction
    youtube_api_key: str = ""  # e.g. AIzaSy...

    # Upload settings
    upload_temp_dir: str = "./uploads"
    max_upload_file_size: int = 500 * 1024 * 1024  # 500MB

    # Observability
    sentry_dsn: str = ""
    log_level: str = "INFO"

    # Speech transcription (default: 'base' matches Dockerfile pre-cached model)
    whisper_model_path: str = "base"
    whisper_model_size: str = "base"  # tiny/base/small/medium/large-v3
    whisper_device: str = "auto"  # auto/cpu/cuda
    whisper_compute_type: str = "int8"  # int8/float16/float32
    whisper_chunk_duration: int = 600  # 10 minutes per chunk (legacy, used by chunked fallback)
    whisper_max_concurrent_chunks: int = 2  # legacy, used by chunked fallback

    # WhisperX alignment & VAD
    whisperx_align_model: str = ""  # Override alignment model name; empty = auto by language
    whisperx_vad_method: str = "pyannote"  # "pyannote" or "silero"
    whisperx_batch_size: int = 8  # Batch size for inference (1 for CPU, 8-16 for GPU)

    # Transcription temp directory
    transcription_temp_dir: str = "./tmp/transcription"

    # Video download settings (for yt-dlp)
    video_download_timeout: int = 1800  # 30 minutes — large YouTube videos can take a while
    video_preferred_height: int = 720  # Maximum download resolution

    # Frontend URL for CORS
    frontend_url: str = "http://localhost:3000"

    # CSP connect-src domains (space-separated, e.g. "https://api.openai.com https://gateway.agnes.ai")
    csp_connect_domains: str = ""

    # SMTP / email
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_use_tls: bool = True
    password_reset_expire_minutes: int = 30

    # Docker/Compose injects extra env vars (e.g. PGHOST, PGDATABASE);
    # ignore them rather than raising validation errors.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def model_post_init(self, __context) -> None:
        """Apply development defaults only when env is development."""
        if self.env == "development":
            if not self.database_url:
                object.__setattr__(self, "database_url", "postgresql+asyncpg://speaking:speaking_dev@localhost:5432/speaking")
            if not self.jwt_secret:
                object.__setattr__(self, "jwt_secret", "dev_secret_change_in_production")
        if self.env == "production":
            if not self.jwt_secret:
                raise RuntimeError("JWT_SECRET must be set in production")
            if not self.database_url:
                raise RuntimeError("DATABASE_URL must be set in production")


@lru_cache()
def get_settings() -> Settings:
    return Settings()

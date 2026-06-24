from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Speaking"
    debug: bool = False

    database_url: str = ""
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = ""
    env: str = "development"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    jwt_refresh_expire_days: int = 7
    email_verification_enabled: bool = True
    jwt_blacklist_enabled: bool = True
    password_reset_expire_minutes: int = 30
    bcrypt_rounds: int = 12

    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = "gpt-4o"

    local_media_path: str = "./media"

    # Local video upload limits + temp dir (used by upload_service).
    max_upload_file_size: int = 500 * 1024 * 1024  # 500 MB
    upload_temp_dir: str = "./media/uploads"

    oss_endpoint: str = ""
    oss_bucket: str = ""
    oss_access_key: str = ""
    oss_secret_key: str = ""
    # When False (default), OSS is treated as disabled and upload helpers degrade
    # gracefully — no SDK required to run the app.
    oss_upload_enabled: bool = False
    oss_prefix: str = ""
    oss_cdn_domain: str = ""

    # Payment configuration
    default_payment_provider: str = "mock"  # mock | alipay | wechat
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

    # Observability
    sentry_dsn: str = ""
    log_level: str = "INFO"

    # Speech transcription (default: 'base' matches Dockerfile pre-cached model)
    whisper_model_path: str = "base"
    whisperx_batch_size: int = 16
    whisper_chunk_duration: float = 600.0  # seconds; longer videos use chunked transcription
    whisper_max_concurrent_chunks: int = 2
    whisper_device: str = "auto"  # "auto" | "cuda" | "cpu"
    whisper_compute_type: str = "int8"  # float16 on GPU, int8 on CPU
    whisperx_vad_method: str = "silero"  # "silero" or "pyannote"
    whisperx_align_model: str = ""  # override default align model per language
    transcription_temp_dir: str = "./media/transcription_temp"

    # Translation engine (pluggable)
    translation_engine: str = "agnes"  # agnes | hy_mt2 | qwen | custom
    translation_fallback_engine: str = ""  # optional fallback engine
    translation_batch_size: int = 20
    translation_hymt2_api_key: str = ""
    translation_qwen_api_key: str = ""
    translation_custom_base_url: str = ""
    translation_custom_model: str = ""
    translation_custom_api_key: str = ""

    # Frontend URL for CORS
    frontend_url: str = "http://localhost:3000"
    # Extra domains allowed by the production Content-Security-Policy connect-src
    # directive (space-separated), e.g. "https://api.openai.com".
    csp_connect_domains: str = ""

    # Docker/Compose injects extra env vars (e.g. PGHOST, PGDATABASE);
    # ignore them rather than raising validation errors.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def model_post_init(self, __context) -> None:
        """Apply development defaults only when env is development."""
        if self.env == "development":
            if not self.database_url:
                object.__setattr__(
                    self, "database_url", "postgresql+asyncpg://speaking:speaking_dev@localhost:5432/speaking"
                )
            if not self.jwt_secret:
                object.__setattr__(self, "jwt_secret", "dev_secret_change_in_production")
        if self.env == "production":
            if not self.jwt_secret:
                raise RuntimeError("JWT_SECRET must be set in production")
            if not self.database_url:
                raise RuntimeError("DATABASE_URL must be set in production")


@lru_cache
def get_settings() -> Settings:
    return Settings()

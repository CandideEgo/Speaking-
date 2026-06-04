from pydantic_settings import BaseSettings
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

    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = "gpt-4o"

    local_media_path: str = "./media"

    oss_endpoint: str = ""
    oss_bucket: str = ""
    oss_access_key: str = ""
    oss_secret_key: str = ""

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

    # Observability
    sentry_dsn: str = ""
    log_level: str = "INFO"

    # Frontend URL for CORS
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"

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

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SeeWord"
    debug: bool = False

    database_url: str = ""
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = ""
    env: str = "development"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    jwt_refresh_expire_days: int = 7
    jwt_blacklist_enabled: bool = True
    bcrypt_rounds: int = 12

    # Alibaba Cloud Dysmsapi — SMS verification code for phone login / change
    # phone / reset password. When sms_login_enabled is False (or AK/SK
    # missing), sms_service falls back to a dev fake that logs/accepts the
    # fixed code "1234" — no Aliyun calls.
    sms_login_enabled: bool = False
    aliyun_sms_access_key: str = ""
    aliyun_sms_secret_key: str = ""
    aliyun_sms_sign_name: str = "速通互联验证码"
    aliyun_sms_template_register: str = "100001"
    aliyun_sms_template_change_phone: str = "100002"
    aliyun_sms_template_reset_password: str = "100003"
    sms_code_expire_seconds: int = 300  # 5 minutes
    aliyun_sms_endpoint: str = "dysmsapi.aliyuncs.com"

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

    # Remote-GPU transcription pipeline. The cloud enqueues a transcription task
    # onto the ``transcription_gpu`` queue (consumed by a GPU worker on a separate
    # machine); the GPU worker transcribes and POSTs the subtitles back to this
    # callback URL. The shared secret authenticates the inbound callback.
    transcription_callback_url: str = ""
    transcription_callback_secret: str = ""
    transcription_gpu_queue_name: str = "transcription_gpu"
    transcription_callback_timeout: int = 30  # seconds per HTTP attempt
    transcription_callback_max_retries: int = 5  # 5xx / connection retries
    # Watchdog: a video stuck in "transcribing" longer than this (seconds) is
    # assumed to have lost its GPU worker and is marked failed.
    video_transcribe_timeout: int = 7200  # 2 hours

    # OSS raw-media transfer for locally-uploaded videos. The cloud uploads the
    # raw upload to OSS and hands the GPU worker a (signed) URL — the GPU worker
    # needs no OSS credentials of its own.
    oss_raw_prefix: str = "video/raw"
    oss_raw_bucket_public: bool = False  # False → use signed URLs (private bucket)
    oss_signed_url_expiry: int = 7200  # seconds; must exceed max queue wait + transcribe

    # Payment configuration
    default_payment_provider: str = "mock"  # mock | alipay | wechat
    alipay_app_id: str = ""
    alipay_public_key: str = ""
    alipay_private_key: str = ""
    wechat_mch_id: str = ""
    wechat_api_v3_key: str = ""
    wechat_serial_no: str = ""
    payment_verify_signature: bool = False
    # ICP 合规：个体工商户无 ICP 经营许可证，不能站内收款。默认禁用站内支付，
    # create-order 端点返回合规提示；取得相应资质后置 True 恢复站内支付链路。
    payments_enabled: bool = False

    # Redeem code lifecycle (ADR-0007). Pro is sold via WeChat mini-shop +
    # redeem codes (no on-site payment per ICP compliance).
    redeem_code_unused_expiry_days: int = 180  # unused codes auto-expire after N days

    # Proxy for external services (yt-dlp, AI)
    http_proxy: str = ""  # e.g. http://172.25.176.1:7897
    youtube_cookies_path: str = ""  # e.g. ./youtube_cookies.txt

    # Observability
    sentry_dsn: str = ""
    log_level: str = "INFO"

    # Speech transcription (default: 'base' matches Dockerfile pre-cached model)
    whisper_model_path: str = "base"
    whisperx_batch_size: int = 8  # ASR batch; lower = less VRAM, fewer OOMs on 8GB GPUs
    whisper_chunk_duration: float = 600.0  # seconds; longer videos use chunked transcription
    whisper_max_concurrent_chunks: int = 2
    whisper_device: str = "auto"  # "auto" | "cuda" | "cpu"
    whisper_compute_type: str = "int8"  # float16 on GPU, int8 on CPU
    whisperx_vad_method: str = "silero"  # "silero" or "pyannote"
    whisperx_align_model: str = ""  # override default align model per language
    # ASR language. Empty = auto-detect per audio (needed for non-English content);
    # set e.g. "en" to force a language and skip detection (faster for English-only).
    whisper_language: str = ""

    # Transcription engine (aligned with translate-tool). "whisperx" = VAD +
    # forced alignment (best quality); "faster_whisper" = raw faster-whisper
    # (lightweight fallback). WhisperX load failure auto-falls back to it.
    whisper_engine: str = "whisperx"
    # WhisperX model ref. Empty = reuse whisper_model_path (a CTranslate2 dir
    # usable by both engines); else a size name (large-v3) or local path.
    whisperx_model: str = ""
    # Explicit WhisperX compute type override. Empty = derive from whisper_device
    # (float16 on cuda, int8 on cpu) — mirrors _detect_device().
    whisperx_compute_type: str = ""
    # Restore punctuation between ASR and alignment. A no-op on turbo models
    # (which emit punctuation natively) but required for small/base models whose
    # raw output lacks punctuation. Set False on turbo to skip the model load
    # + ~2s/chunk prediction (output is identical on/off for turbo).
    whisper_punctuation_restore: bool = True

    transcription_temp_dir: str = "./media/transcription_temp"

    # Translation engine (pluggable). Agnes is retired for translation (prone
    # to missed/low-quality output); qwen + hy_mt2 (both iFLYTEK) are the
    # default pair. Agnes is still used by AIService._chat for non-translation
    # LLM calls (pronunciation/rubric/gloss/grammar/practice questions).
    translation_engine: str = "qwen"  # qwen | hy_mt2 | agnes | glm | custom
    translation_fallback_engine: str = "hy_mt2"  # paired with primary for concurrent mode
    translation_concurrent: bool = True  # run primary + fallback concurrently, first valid wins
    translation_batch_size: int = 5  # smaller batches avoid 404s (agnes) and sentence-merging (hy_mt2)
    translation_hymt2_api_key: str = ""
    translation_qwen_api_key: str = ""
    translation_glm_api_key: str = ""
    translation_glm_base_url: str = "https://maas-coding-api.cn-huabei-1.xf-yun.com/v2"
    translation_glm_model: str = "xopglm51"
    translation_custom_base_url: str = ""
    translation_custom_model: str = ""
    translation_custom_api_key: str = ""

    # Per-video AI word-notes prewarm (finalize_video.prewarm_notes step).
    # Comma-separated list of engines to fan batches across concurrently.
    # "agnes" uses OPENAI_*; others resolve via the translation engine
    # registry (same creds as TRANSLATION_*_API_KEY). Set to "agnes" alone
    # to keep the old single-engine sequential behavior.
    prewarm_engines: str = "agnes,qwen"
    prewarm_concurrency: int = 4  # max in-flight LLM calls per engine

    # Video scoring (P1, ADR-0011). 6-factor weighted learning_score (0-100)
    # computed by scoring_service + refreshed by scoring beat tasks. Weights
    # are applied to 0-1 factor values; ``score_bonus_points`` is additive on
    # top of the 0-100 weighted base (not a weight). All tunable via env so
    # scoring can be retuned without code changes. See LAUNCH-SPRINT-2026-07
    # 阶段 4. No-data phase: CTR/Retention/WatchTime stay 0 (no redistribution);
    # TopicMatch/Quality/Bonus give new videos a non-zero baseline.
    score_weight_ctr: float = 0.30
    score_weight_retention: float = 0.25
    score_weight_watch_time: float = 0.20
    score_weight_topic_match: float = 0.15
    score_weight_quality: float = 0.10
    score_bonus_points: float = 10.0  # additive bonus (max +10 points)
    # Saturation benchmarks: the count at which a factor reaches 1.0.
    score_ctr_click_benchmark: int = 50  # 50 clicks → CTR factor 1.0
    score_watch_time_benchmark: int = 36000  # 10h total watch → WatchTime factor 1.0

    # Home feed recommendation (P2, ADR-0011). 40/30/20/10 mix of
    # high-score / potential / cold-start / long-form videos, plus diversity
    # (same topic_tags ≤N consecutive) and soft personalization (history click
    # topic_tags + target_exam/level CEFR match — NOT a hard filter, since
    # videos have no exam_level field and a hard filter would empty a 13-video
    # pool). Ratios must sum to ~1.0; shortfall buckets backfill from top.
    # See LAUNCH-SPRINT-2026-07 阶段 5.
    recommend_ratio_top: float = 0.40
    recommend_ratio_potential: float = 0.30
    recommend_ratio_cold: float = 0.20
    recommend_ratio_long: float = 0.10
    recommend_cold_start_days: int = 7  # created_at within N days → cold bucket
    recommend_long_duration_min: int = 1200  # duration (s) → long-form bucket
    recommend_min_score_for_long: float = 30.0  # long-form must clear this score
    recommend_consecutive_tag_max: int = 2  # max consecutive same first-topic
    recommend_min_clicks_for_personalization: int = 3  # below this → global sort
    recommend_home_ttl_seconds: int = 60  # Redis cache TTL for home feed

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
            if not self.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY must be set in production")
            if not self.redis_url:
                raise RuntimeError("REDIS_URL must be set in production")
            if not self.transcription_callback_secret:
                raise RuntimeError("TRANSCRIPTION_CALLBACK_SECRET must be set in production")


@lru_cache
def get_settings() -> Settings:
    return Settings()

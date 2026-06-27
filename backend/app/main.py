import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.api.v1 import (
    admin,
    ai,
    auth,
    browse,
    comments,
    community,
    favorites,
    internal,
    invite,
    learning,
    media,
    notifications,
    payments,
    practice,
    rubrics,
    speaking,
    users,
    videos,
    vocabulary,
    words,
)
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.logging import configure_logging, get_logger
from app.services.ai_service import AIServiceError

settings = get_settings()
configure_logging()
logger = get_logger(__name__)

# Initialize Sentry in production
if settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.env,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
    )
    logger.info("Sentry initialized", environment=settings.env)


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."},
    )


async def _ai_service_error_handler(request: Request, exc: AIServiceError) -> JSONResponse:
    """Surface AI/LLM failures as 502 instead of letting them become 500s or,
    worse, silent fake-zero scores. Keeps the message safe to return to clients."""
    logger.warning("ai_service_error path=%s detail=%s", request.url.path, exc)
    return JSONResponse(
        status_code=502,
        content={"detail": "AI 服务暂不可用，请稍后重试"},
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup/shutdown lifecycle.

    - Startup: services initialise lazily (Redis singleton, DB engine pool).
    - Shutdown: dispose DB engine pool and close Redis connection.
    """
    yield
    # --- Shutdown ---
    from app.core.database import engine as db_engine

    await db_engine.dispose()
    logger.info("database_engine_disposed")

    from app.core.redis import close_redis

    await close_redis()


def create_app() -> FastAPI:
    # Import all models so SQLAlchemy registers them on Base.metadata before
    # any create_all (e.g. conftest in tests) or Alembic autogenerate runs.
    from app import models

    app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)
    Instrumentator().instrument(app).expose(app)

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
    app.add_exception_handler(AIServiceError, _ai_service_error_handler)

    # Request ID middleware
    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    # Request logging middleware
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        response = await call_next(request)
        logger.info(
            "request",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            request_id=getattr(request.state, "request_id", "-"),
        )
        return response

    # Security headers middleware
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        if request.url.path.startswith("/media"):
            return await call_next(request)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if settings.env == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
            connect_src = f"'self' {settings.csp_connect_domains}" if settings.csp_connect_domains else "'self'"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "media-src 'self' https:; "
                f"connect-src {connect_src}; "
                "object-src 'none'; "
                "base-uri 'self'"
            )
        return response

    allowed_origins = (
        ["http://localhost:3000", "http://127.0.0.1:3000"] if settings.env == "development" else [settings.frontend_url]
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )

    media_path = Path(settings.local_media_path).resolve()
    media_path.mkdir(parents=True, exist_ok=True)
    # Range-aware media serving (Starlette StaticFiles ignores Range headers,
    # which breaks <video> seeking). See app/api/v1/media.py.
    app.include_router(media.router)

    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")
    app.include_router(videos.router, prefix="/api/v1")
    app.include_router(favorites.router, prefix="/api/v1")
    app.include_router(speaking.router, prefix="/api/v1")
    app.include_router(ai.router, prefix="/api/v1")
    app.include_router(invite.router, prefix="/api/v1")
    app.include_router(payments.router, prefix="/api/v1")
    if settings.env in ("development", "testing"):
        from app.api.v1 import mock_payments

        app.include_router(mock_payments.router, prefix="/api/v1")
    app.include_router(vocabulary.router, prefix="/api/v1")
    app.include_router(words.router, prefix="/api/v1")
    app.include_router(practice.router, prefix="/api/v1")
    app.include_router(browse.router, prefix="/api/v1")
    app.include_router(community.router, prefix="/api/v1")
    app.include_router(comments.router, prefix="/api/v1")
    app.include_router(rubrics.router, prefix="/api/v1")
    app.include_router(admin.router, prefix="/api/v1")
    app.include_router(notifications.router, prefix="/api/v1")
    app.include_router(learning.router, prefix="/api/v1")
    app.include_router(internal.router, prefix="/api/v1")

    @app.get("/health")
    async def health():
        checks = {}
        all_healthy = True

        # --- Database connectivity check ---
        try:
            from app.core.database import engine as db_engine

            async with db_engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            checks["database"] = {"status": "ok"}
        except Exception as exc:
            all_healthy = False
            checks["database"] = {"status": "error", "detail": str(exc)}

        # --- Redis connectivity check (using shared client) ---
        try:
            from app.core.redis import get_redis

            redis_client = get_redis()
            await redis_client.ping()
            checks["redis"] = {"status": "ok"}
        except Exception as exc:
            all_healthy = False
            checks["redis"] = {"status": "error", "detail": str(exc)}

        payload = {
            "status": "ok" if all_healthy else "degraded",
            "timestamp": datetime.now(UTC).isoformat(),
            "environment": settings.env,
            "components": checks,
        }

        status_code = 200 if all_healthy else 503
        return JSONResponse(content=payload, status_code=status_code)

    return app


app = create_app()

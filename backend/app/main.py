from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.core.config import get_settings
from app.api.v1 import auth, users, videos, speaking, ai, payments, invite

settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, debug=settings.debug)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    media_path = Path(settings.local_media_path).resolve()
    media_path.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=str(media_path)), name="media")

    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")
    app.include_router(videos.router, prefix="/api/v1")
    app.include_router(speaking.router, prefix="/api/v1")
    app.include_router(ai.router, prefix="/api/v1")
    app.include_router(invite.router, prefix="/api/v1")
    app.include_router(payments.router, prefix="/api/v1")

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()


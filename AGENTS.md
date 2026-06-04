# AGENTS.md — Speaking

## Project Architecture

- **backend/**: Python FastAPI (`app/main.py` entry), async SQLAlchemy, Celery tasks, Alembic migrations
- **frontend/**: Next.js 14 App Router (`src/`), Tailwind, lucide-react icons, Zustand state management
- **Infra**: PostgreSQL 16, Redis 7, Celery workers, Nginx (prod)

## Task Conventions

- Backend changes: run `uvicorn app.main:app --reload` to verify. FastAPI auto-docs at `/docs`.
- Frontend changes: `npm run dev` with HMR on port 3000.
- DB changes go through Alembic (`alembic revision --autogenerate`, then `alembic upgrade head`).
- Celery tasks in `backend/app/tasks/`. Restart worker after task changes.
- Media files stored under `backend/media/` locally (gitignored). OSS used in prod for CDN.
- Never commit `.env`. Use `.env.example` as reference.
- Open files in both backend and frontend when a change spans layers.

## Key Modules

| Module | Backend | Frontend |
|--------|---------|----------|
| Auth | `api/v1/auth.py` | `app/login/`, `app/register/` |
| Users | `api/v1/users.py` (GET/PATCH /me) | Dashboard profile section |
| Videos | `api/v1/videos.py` | `components/video/`, `app/watch/[id]/` |
| Speaking | `api/v1/speaking.py` | `components/speaking/` |
| Vocabulary | `api/v1/vocabulary.py` (CRUD + SM-2 review) | `app/vocabulary/` |
| AI | `api/v1/ai.py` (word-lookup, summary, recommend) | WordTooltip, AIStatsPanel |
| Browse | `api/v1/browse.py` | `app/browse/` |
| Community | `api/v1/community.py` | `app/community/` |
| Rubrics | `api/v1/rubrics.py` | SpeakingPanel scoring |
| YouTube | `api/v1/youtube.py` (yt-dlp search) | YouTubeSearch component |
| Payments | `api/v1/payments.py` (Order model) | Dashboard upgrade section |
| Invite | `api/v1/invite.py` (admin-only generate) | `app/redeem/` |

## Frontend State

- Zustand store in `frontend/src/stores/watchStore.ts` — manages subtitle mode state
- 8 subtitle modes: bilingual, english, chinese, reading, dictation, fillblank, flashcard, translate
- Each mode has its own component in `frontend/src/components/`

## Speech Recognition

- Uses `faster-whisper` (not `openai-whisper`) with int8 quantization
- Model path configured via `WHISPER_MODEL_PATH` env var
- Used in both `speaking_service.py` (user recording) and `video_processing.py` (subtitle generation)

## Testing

- Backend: `pytest tests/ -v` (auth, speaking, payments, invite, videos, SR service)
- Frontend: `npx tsc --noEmit && npm run lint && npm run build`
- CI: `.github/workflows/ci.yml` runs on push/PR

---
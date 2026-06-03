# AGENTS.md — Speaking

## Project Architecture

- **backend/**: Python FastAPI (`app/main.py` entry), async SQLAlchemy, Celery tasks, Alembic migrations
- **frontend/**: Next.js 14 App Router (`src/`), Tailwind, lucide-react icons
- **Infra**: PostgreSQL 16, Redis 7, Celery workers

## Task Conventions

- Backend changes: run `uvicorn app.main:app --reload` to verify. FastAPI auto-docs at `/docs`.
- Frontend changes: `npm run dev` with HMR on port 3000.
- DB changes go through Alembic (`alembic revision --autogenerate`, then `alembic upgrade head`).
- Celery tasks in `backend/app/tasks/`. Restart worker after task changes.
- Media files stored under `backend/media/` locally (gitignored). OSS used in prod for CDN.
- Never commit `.env`. Use `.env.example` as reference.
- Open files in both backend and frontend when a change spans layers.

---
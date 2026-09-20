# Module Owners

> Routing table for splitting one task across multiple agents (or resuming a split task
> in a fresh session). Each owner is a context slice: an agent working that slice loads
> only its own row here, its one `wiki/` document, and the contract files it touches.
> Knowledge facts still belong to the files listed in `README.md` — this table only
> decides *which* of them an agent loads. State transfer between agents goes through
> `handoffs/`, not through chat history.

## Contract files

Cross-owner coupling points. Any change to one of these is a **contract change** and
requires a handoff entry (see `handoffs/README.md`):

- `backend/app/schemas/video.py` — API response shapes
- `backend/app/core/config.py` — settings surface
- `backend/app/api/dependencies.py` — auth dependency injection
- `frontend/src/lib/api.ts` (+ `createApiClient.ts`) — API client and types feed

## Owners

| Owner | Backend scope | Frontend scope | Must-read wiki |
|-------|---------------|----------------|----------------|
| `video-pipeline` | `tasks/`, `services/transcription/`, `services/translation/`, `services/video_*`, `api/v1/media.py`, `api/v1/videos.py` | media playback pieces under `components/watch/` | `wiki/architecture/video-pipeline.md` + `wiki/architecture/translation-quality-safety-net.md` |
| `vocab-learning` | `services/exam_service.py`, `vocab_set_service.py`, `vocabulary_service.py`, `sr_service.py`, `word_notes.py`, `ecdict/`, `api/v1/vocabulary*.py`, `api/v1/exams.py` | `app/(main)/vocabulary/`, sieve UI | `wiki/architecture/exam-vocabulary.md` |
| `user-ops` | `api/v1/auth.py`, `users.py`, `redeem.py`, `notifications.py`, payments, `services/profile_service.py`, `learning_event_service.py` | `app/(main)/profile/`, `app/(main)/login|register|onboarding` | `wiki/architecture/auth-system.md` |
| `admin-console` | `services/admin_service.py`, `video_review_service.py`, `subtitle_edit_service.py`, `api/v1/admin*.py`, `api/v1/catalog*.py` | `app/(admin)/`, `components/admin/`, `components/video-edit/` | `wiki/architecture/backend-services.md` + `wiki/architecture/frontend-architecture.md` |
| `frontend-main` | — | `app/(main)/` (home, browse, watch, search, favorites, history), `components/` except admin/video-edit, `stores/`, `hooks/` | `wiki/architecture/frontend-architecture.md` |
| `infra-quality` | `core/`, `models/`, `schemas/`, `scripts/check-knowledge/` | lint/test/build configs | none — read the check configs directly |

Hot files (load on demand, never whole unless editing them):
`tasks/video_processing.py` (1.4k lines), `api/v1/videos.py` (1.3k),
`app/(main)/watch/[id]/page.tsx` (1.3k).

## Loading protocol

| Tier | Content | Budget |
|------|---------|--------|
| T0 | `AGENTS.md` + `invariants.md` + `state.md` Current Focus | ≤15K tokens |
| T1 | This file (owner row) + the owner's `wiki/` document | ≤15K |
| T2 | Own slice's code + contract files as needed | ≤80K |
| T3 | Test output tail only; exploration beyond ~2 files goes to a subagent | transient |

## Rules

1. The planning session loads T0 only — task list plus acceptance criteria, never
   implementation files.
2. An execution agent loads T0+T1+its slice. It must not read another owner's files
   except contract files, and learns about upstream work from `handoffs/`, not from
   re-reading diffs.
3. Contract changes are written to a handoff entry **before the session ends**;
   both directions count (backend shape change → check `frontend/src/types/`,
   frontend type change → check `schemas/`).
4. At most 2 execution agents run in parallel, and only when they touch different
   owners and different contract files. Worktree parallelism is not used here —
   backend dev/tests share one Postgres and Redis.
5. Acceptance is mechanical first: `pytest`, `ruff check`, `mypy`, `tsc --noEmit`,
   `eslint`, `check_knowledge.py` all green. The planner then reviews the handoffs
   plus contract diffs only — never the full diff.

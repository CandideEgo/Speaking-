# Wiki Index

> Long-term engineering knowledge base. Only documents with lasting value.

## Architecture

- [Video Processing Pipeline](architecture/video-pipeline.md) — Split Head/GPU/Tail pipeline, queue topology, checkpoint resume
- [Backend Service Layer](architecture/backend-services.md) — Service layer design, key services, key patterns
- [Auth System](architecture/auth-system.md) — JWT auth, dual sessions, auth dependencies, Zustand stores
- [Frontend Architecture](architecture/frontend-architecture.md) — Next.js 16, Tailwind v4, dark mode, design system
- [Exam-Level Vocabulary](architecture/exam-vocabulary.md) — ECDICT annotation, AI prewarming, user-level filtering

## Decisions

- (Decisions with long-term impact that warrant separate documents. For most decisions, see `.agent/decisions.md`)

## Problems

- [Image Handling in Agent Sessions](problems/image-handling.md) — Why images corrupt sessions, how to handle, recovery

## Patterns

- (Reusable design patterns and engineering experiences, to be added as discovered)

## Guides

- [Development Setup](guides/setup.md) — Local dev, infrastructure, environment, production deploy, video seeding
- [Testing Guide](guides/testing.md) — Backend tests, frontend checks, CI, lint & format

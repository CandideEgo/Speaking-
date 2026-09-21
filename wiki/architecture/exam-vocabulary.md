---
title: Exam-Level Vocabulary System
tags: [feature, vocabulary, ecdict, ai]
status: active
confidence: verified
related_code: [exam-levels, ecdict-service]
related: [wiki/architecture/video-pipeline.md]
created: 2026-07-21
updated: 2026-09-22
---

# Background

Core differentiator: automatic exam-level vocabulary annotation in video subtitles (CET4/6, gaokao, etc.).

# Two-Stage Annotation

1. **Local annotation (ingest time)**: ECDICT dictionary local lookup, zero API calls, tags each word with exam levels
2. **AI word note prewarming (finalize time)**: batch LLM calls to generate word notes, supports dual-engine (agnes + qwen) concurrent

# User-Level Filtering

Frontend filters highlighting by user's `target_exam_level`. Two rules share the
same target level but answer different questions:

- **Visibility** (`shouldDisplay`) — a word is highlighted when its *highest*
  level order ≥ the target's order. Unchanged by DEC-042.
- **Color** (`displayLevel` / `wordHighlightClass`, mirrored by
  `display_level` in `backend/app/core/exam_levels.py`) — when the word itself
  belongs to the target level, that level's color wins; otherwise fall back to
  the word's highest level. Without this, a word in [四级, 雅思] rendered 雅思 red
  even when the user had selected 四级, so the color read as a false signal
  about *which* level the word was flagged for.

Callers with no target context (admin editors, word tooltips) omit the
parameter and keep the plain highest-level fallback.

# Word Card Lookup

A clicked word renders in two tiers, because the latency was all database and none of it ECDICT:

- `GET /words/gloss/static` — ECDICT only, in-memory, zero DB round trips: headword, phonetic,
  inflection label, definition, translation, levels. This is the base card.
- `GET /words/gloss/enrich` — everything DB-backed: exam-corpus example sentence, high-frequency
  badge, AI notes. It takes the `lemma` the static call returned, so normalization is not redone.

The frontend fires them in order and merges the second into the first (`useWordLookup` +
`mergeEnrich`). `mergeEnrich` copies **only the fields the enrich endpoint owns** — an enrich
response carrying `null` for a static field must not overwrite what the base card already
rendered — and a response for a word the user has already clicked past is dropped. Consequence
for future work: a new word-card field must be assigned to a tier *and* added to `mergeEnrich`,
or it silently never appears.

`get_best_note` fetches all four note candidates (video:lemma, video:surface, global:lemma,
global:surface) in one `or_` query and returns the highest-priority hit instead of doing up to
four sequential SELECTs. Priority is unchanged: video-specific beats global, lemma beats surface.

`GET /words/gloss` (one request, everything at once) still exists and is still covered by tests,
but nothing in the app calls it any more — a dormant endpoint. Extend the two tiers, not it.

# Config

`backend/app/core/exam_levels.py` defines exam level mapping.

# Future Notes

- ECDICT database ~30MB, downloaded via `scripts/download_ecdict.py`, in `.gitignore`
- New exam levels require updating `exam_levels.py` and ECDICT mapping
- AI word note cache in Redis — note fail-open degradation

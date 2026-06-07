---
name: models
description: "Skill for the Models area of Speaking-. 12 symbols across 8 files."
---

# Models

12 symbols | 8 files | Cohesion: 100%

## When to Use

- Working with code in `backend/`
- Understanding how Base, InviteCode, SpeakingAttempt work
- Modifying models-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/app/models/learning.py` | SpeakingAttempt, LearningRecord, Vocabulary |
| `backend/app/models/rubric.py` | SpeakingRubric, RubricCriterion, SpeakingAttemptScore |
| `backend/app/core/database.py` | Base |
| `backend/app/models/invite.py` | InviteCode |
| `backend/app/models/order.py` | Order |
| `backend/app/models/subtitle.py` | Subtitle |
| `backend/app/models/user.py` | User |
| `backend/app/models/video.py` | Video |

## Entry Points

Start here when exploring this area:

- **`Base`** (Class) — `backend/app/core/database.py:14`
- **`InviteCode`** (Class) — `backend/app/models/invite.py:15`
- **`SpeakingAttempt`** (Class) — `backend/app/models/learning.py:7`
- **`LearningRecord`** (Class) — `backend/app/models/learning.py:29`
- **`Vocabulary`** (Class) — `backend/app/models/learning.py:49`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `Base` | Class | `backend/app/core/database.py` | 14 |
| `InviteCode` | Class | `backend/app/models/invite.py` | 15 |
| `SpeakingAttempt` | Class | `backend/app/models/learning.py` | 7 |
| `LearningRecord` | Class | `backend/app/models/learning.py` | 29 |
| `Vocabulary` | Class | `backend/app/models/learning.py` | 49 |
| `Order` | Class | `backend/app/models/order.py` | 15 |
| `SpeakingRubric` | Class | `backend/app/models/rubric.py` | 7 |
| `RubricCriterion` | Class | `backend/app/models/rubric.py` | 23 |
| `SpeakingAttemptScore` | Class | `backend/app/models/rubric.py` | 38 |
| `Subtitle` | Class | `backend/app/models/subtitle.py` | 6 |
| `User` | Class | `backend/app/models/user.py` | 18 |
| `Video` | Class | `backend/app/models/video.py` | 21 |

## How to Explore

1. `gitnexus_context({name: "Base"})` — see callers and callees
2. `gitnexus_query({query: "models"})` — find related execution flows
3. Read key files listed above for implementation details

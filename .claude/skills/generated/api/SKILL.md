---
name: api
description: "Skill for the Api area of Speaking-. 3 symbols across 2 files."
---

# Api

3 symbols | 2 files | Cohesion: 100%

## When to Use

- Working with code in `backend/`
- Understanding how get_current_user, get_optional_user, decode_token work
- Modifying api-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/app/api/dependencies.py` | get_current_user, get_optional_user |
| `backend/app/core/security.py` | decode_token |

## Entry Points

Start here when exploring this area:

- **`get_current_user`** (Function) — `backend/app/api/dependencies.py:14`
- **`get_optional_user`** (Function) — `backend/app/api/dependencies.py:37`
- **`decode_token`** (Function) — `backend/app/core/security.py:22`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `get_current_user` | Function | `backend/app/api/dependencies.py` | 14 |
| `get_optional_user` | Function | `backend/app/api/dependencies.py` | 37 |
| `decode_token` | Function | `backend/app/core/security.py` | 22 |

## How to Explore

1. `gitnexus_context({name: "get_current_user"})` — see callers and callees
2. `gitnexus_query({query: "api"})` — find related execution flows
3. Read key files listed above for implementation details

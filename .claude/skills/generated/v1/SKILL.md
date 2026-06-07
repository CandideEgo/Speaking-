---
name: v1
description: "Skill for the V1 area of Speaking-. 36 symbols across 15 files."
---

# V1

36 symbols | 15 files | Cohesion: 93%

## When to Use

- Working with code in `backend/`
- Understanding how register, login, hash_password work
- Modifying v1-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/app/api/v1/payments.py` | _verify_alipay_signature, alipay_callback, _verify_wechat_signature, wechat_callback, _generate_order_number (+1) |
| `backend/app/api/v1/ai.py` | _get_ai_service, word_lookup, assistant_recommend, assistant_summary |
| `backend/app/api/v1/videos.py` | detect_platform, extract_youtube_video_id, submit_video, seed_video |
| `backend/app/core/security.py` | hash_password, verify_password, create_token |
| `backend/app/services/ai_service.py` | word_context_meaning, assistant_recommend, assistant_daily_summary |
| `backend/app/api/v1/rubrics.py` | _serialize_criteria, list_rubrics, get_default_rubric |
| `backend/app/api/v1/auth.py` | register, login |
| `backend/tests/conftest.py` | auth_headers, admin_headers |
| `backend/app/api/v1/browse.py` | _clean_expired_cache, browse_feed |
| `backend/app/api/v1/community.py` | _clean_expired_cache, community_feed |

## Entry Points

Start here when exploring this area:

- **`register`** (Function) — `backend/app/api/v1/auth.py:14`
- **`login`** (Function) — `backend/app/api/v1/auth.py:34`
- **`hash_password`** (Function) — `backend/app/core/security.py:8`
- **`verify_password`** (Function) — `backend/app/core/security.py:12`
- **`create_token`** (Function) — `backend/app/core/security.py:16`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `register` | Function | `backend/app/api/v1/auth.py` | 14 |
| `login` | Function | `backend/app/api/v1/auth.py` | 34 |
| `hash_password` | Function | `backend/app/core/security.py` | 8 |
| `verify_password` | Function | `backend/app/core/security.py` | 12 |
| `create_token` | Function | `backend/app/core/security.py` | 16 |
| `auth_headers` | Function | `backend/tests/conftest.py` | 85 |
| `admin_headers` | Function | `backend/tests/conftest.py` | 105 |
| `word_lookup` | Function | `backend/app/api/v1/ai.py` | 25 |
| `assistant_recommend` | Function | `backend/app/api/v1/ai.py` | 68 |
| `browse_feed` | Function | `backend/app/api/v1/browse.py` | 51 |
| `community_feed` | Function | `backend/app/api/v1/community.py` | 41 |
| `search_youtube` | Function | `backend/app/services/youtube_service.py` | 6 |
| `assistant_summary` | Function | `backend/app/api/v1/ai.py` | 39 |
| `speaking_stats` | Function | `backend/app/api/v1/speaking.py` | 124 |
| `get_user_stats` | Function | `backend/app/services/speaking_service.py` | 82 |
| `detect_platform` | Function | `backend/app/api/v1/videos.py` | 17 |
| `extract_youtube_video_id` | Function | `backend/app/api/v1/videos.py` | 26 |
| `submit_video` | Function | `backend/app/api/v1/videos.py` | 38 |
| `seed_video` | Function | `backend/app/api/v1/videos.py` | 268 |
| `list_rubrics` | Function | `backend/app/api/v1/rubrics.py` | 24 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Assistant_summary → _chat` | cross_community | 3 |
| `Word_lookup → _chat` | cross_community | 3 |
| `Assistant_recommend → _chat` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Services | 3 calls |

## How to Explore

1. `gitnexus_context({name: "register"})` — see callers and callees
2. `gitnexus_query({query: "v1"})` — find related execution flows
3. Read key files listed above for implementation details

---
name: tests
description: "Skill for the Tests area of Speaking-. 13 symbols across 4 files."
---

# Tests

13 symbols | 4 files | Cohesion: 100%

## When to Use

- Working with code in `backend/`
- Understanding how review_word, calculate_next_review, test_first_correct_review_returns_1_day work
- Modifying tests-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `backend/tests/test_sr_service.py` | test_first_correct_review_returns_1_day, test_second_correct_review_returns_6_days, test_third_correct_review_uses_ease_factor, test_incorrect_response_resets_interval, test_perfect_quality_increases_ease_factor (+3) |
| `backend/tests/test_invite.py` | _generate_code, test_redeem_upgrades_user, test_redeem_already_used_code |
| `backend/app/api/v1/vocabulary.py` | review_word |
| `backend/app/services/sr_service.py` | calculate_next_review |

## Entry Points

Start here when exploring this area:

- **`review_word`** (Function) — `backend/app/api/v1/vocabulary.py:104`
- **`calculate_next_review`** (Function) — `backend/app/services/sr_service.py:7`
- **`test_first_correct_review_returns_1_day`** (Method) — `backend/tests/test_sr_service.py:6`
- **`test_second_correct_review_returns_6_days`** (Method) — `backend/tests/test_sr_service.py:13`
- **`test_third_correct_review_uses_ease_factor`** (Method) — `backend/tests/test_sr_service.py:20`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `review_word` | Function | `backend/app/api/v1/vocabulary.py` | 104 |
| `calculate_next_review` | Function | `backend/app/services/sr_service.py` | 7 |
| `test_first_correct_review_returns_1_day` | Method | `backend/tests/test_sr_service.py` | 6 |
| `test_second_correct_review_returns_6_days` | Method | `backend/tests/test_sr_service.py` | 13 |
| `test_third_correct_review_uses_ease_factor` | Method | `backend/tests/test_sr_service.py` | 20 |
| `test_incorrect_response_resets_interval` | Method | `backend/tests/test_sr_service.py` | 27 |
| `test_perfect_quality_increases_ease_factor` | Method | `backend/tests/test_sr_service.py` | 34 |
| `test_poor_quality_decreases_ease_factor` | Method | `backend/tests/test_sr_service.py` | 40 |
| `test_ease_factor_never_below_1_3` | Method | `backend/tests/test_sr_service.py` | 46 |
| `test_invalid_quality_raises_error` | Method | `backend/tests/test_sr_service.py` | 52 |
| `test_redeem_upgrades_user` | Method | `backend/tests/test_invite.py` | 44 |
| `test_redeem_already_used_code` | Method | `backend/tests/test_invite.py` | 71 |
| `_generate_code` | Method | `backend/tests/test_invite.py` | 36 |

## How to Explore

1. `gitnexus_context({name: "review_word"})` — see callers and callees
2. `gitnexus_query({query: "tests"})` — find related execution flows
3. Read key files listed above for implementation details

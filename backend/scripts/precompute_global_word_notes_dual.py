#!/usr/bin/env python
"""Dual-API parallel preheat of global AI learning notes for ECDICT exam words.

Runs two concurrent workers — one hitting Agnes, one hitting Xunfei Qwen —
each pulling batches from a shared asyncio.Queue. Because the script is
idempotent (skips words already having a global note), both workers safely
write to the same ``word_ai_notes`` table via upsert.

Usage:
    cd backend
    python scripts/precompute_global_word_notes_dual.py            # process all
    python scripts/precompute_global_word_notes_dual.py --limit 500  # first 500
    python scripts/precompute_global_word_notes_dual.py --levels cet4 cet6
    python scripts/precompute_global_word_notes_dual.py --batch-size 15
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from openai import AsyncOpenAI
from sqlalchemy import select

from app.core.database import async_session
from app.models.word_note import WordAINote
from app.services import ecdict
from app.services.word_notes import GLOBAL_SOURCE, upsert_notes

LEVEL_ORDER = {"zhongkao": 1, "gaoKao": 2, "cet4": 3, "cet6": 4, "ky": 5, "ielts": 6, "toefl": 6, "gre": 7}

SYSTEM_PROMPT = (
    "You are an English learning tutor for Chinese students preparing for CET/高考/考研. "
    "For each input word, return JSON with three short Chinese fields.\n\n"
    '- "contextual_note": the word\'s meaning in the given context (1 sentence, under 50 字)\n'
    '- "pitfalls": 1-2 common mistakes Chinese learners make with this word (under 60 字)\n'
    '- "knowledge": 1 short usage tip — collocation, etymology, or register (under 60 字)\n\n'
    'Return a JSON object {"notes": [{"word": ..., "contextual_note": ..., "pitfalls": ..., "knowledge": ...}, ...]} '
    "with exactly one entry per input word, in the same order. Keep Chinese compact."
)


def _highest_level(levels: list[str]) -> str:
    if not levels:
        return "global"
    return max(levels, key=lambda lv: LEVEL_ORDER.get(lv, 0))


def _build_user_prompt(batch: list[dict]) -> str:
    word_block = "\n".join(
        f"{i + 1}. {w['word']}\n   Context: {w.get('context_sentence', '') or '(none)'}" for i, w in enumerate(batch)
    )
    return f"Source: global\nLevel: global\nThese are general-purpose notes for any context.\n\nWords:\n{word_block}"


async def _existing_words(db, levels: list[str] | None) -> set[str]:
    stmt = select(WordAINote.word).where(WordAINote.context_source == GLOBAL_SOURCE)
    if levels:
        stmt = stmt.where(WordAINote.level.in_(levels))
    return {(r[0]).lower() for r in (await db.execute(stmt)).all()}


async def _worker(
    name: str,
    client: AsyncOpenAI,
    model: str,
    batches: list[tuple[int, list[dict]]],
    counter: list,  # [total_done]
    errors: list,  # [total_errors]
    batch_size: int,
):
    """Process batches sequentially from a pre-allocated slice."""
    done = 0
    errs = 0
    for batch_idx, batch in batches:
        try:
            t0 = time.perf_counter()
            user_prompt = _build_user_prompt(batch)
            resp = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            parsed = json.loads(resp.choices[0].message.content or "{}")
            notes_raw = parsed.get("notes") if isinstance(parsed, dict) else None
            if not isinstance(notes_raw, list):
                notes_raw = []

            aligned: list[dict] = []
            for i, w in enumerate(batch):
                n = notes_raw[i] if i < len(notes_raw) and isinstance(notes_raw[i], dict) else {}
                aligned.append(
                    {
                        "word": w["word"],
                        "level": w.get("level", "global"),
                        "context_source": GLOBAL_SOURCE,
                        "contextual_note": str(n.get("contextual_note") or "").strip(),
                        "pitfalls": str(n.get("pitfalls") or "").strip(),
                        "knowledge": str(n.get("knowledge") or "").strip(),
                    }
                )

            async with async_session() as db:
                await upsert_notes(db, aligned)

            elapsed = time.perf_counter() - t0
            done += len(aligned)
            counter[0] += len(aligned)
            print(
                f"[{name}] batch {batch_idx}: +{len(aligned)} words ({elapsed:.0f}s) — total {counter[0]}",
                flush=True,
            )
        except Exception as exc:
            errs += 1
            errors[0] += 1
            print(f"[{name}] error batch {batch_idx}: {exc}", file=sys.stderr, flush=True)
    return done, errs


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=0, help="max words to process (0 = all)")
    parser.add_argument("--levels", nargs="+", default=None, help="restrict to these levels (e.g. cet4 cet6)")
    parser.add_argument("--batch-size", type=int, default=15, help="words per LLM call")
    args = parser.parse_args()

    if not ecdict.is_available():
        print(f"[error] ECDICT db not found at {ecdict.DB_PATH}", file=sys.stderr)
        return 1
    ecdict.get_index()

    async with async_session() as db:
        existing = await _existing_words(db, args.levels)
        all_words = [
            (lemma, entry["levels"])
            for lemma, entry in ecdict.get_index().words.items()
            if (not args.levels or any(lv in args.levels for lv in entry["levels"]))
        ]
        all_words.sort(key=lambda x: x[0])
        todo = [(lemma, lv) for lemma, lv in all_words if lemma not in existing]
        already = len(all_words) - len(todo)
        if args.limit:
            todo = todo[: args.limit]
        total = len(all_words)
        print(
            f"[plan] {total} exam words; "
            f"{len(todo)} to process; {already} already have global notes"
            + (f" (--limit {args.limit} truncates the run)" if args.limit else ""),
            flush=True,
        )

        if not todo:
            print("[done] nothing to do", flush=True)
            return 0

    # Build items and batches
    items = []
    for lemma, levels in todo:
        items.append(
            {
                "word": lemma,
                "level": _highest_level(levels),
                "context_sentence": "",
            }
        )

    batches = []
    for i in range(0, len(items), args.batch_size):
        batches.append((i // args.batch_size, items[i : i + args.batch_size]))

    # Split batches: even-indexed → agnes, odd-indexed → xunfei
    agnes_batches = batches[0::2]
    xunfei_batches = batches[1::2]

    # ── Create two API clients ──────────────────────────────────────────────
    from app.core.config import get_settings

    settings = get_settings()

    agnes_client = AsyncOpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
    )
    agnes_model = settings.openai_model

    xf_client = AsyncOpenAI(
        api_key="5dba42b7921f8a299d7fa283e445914c:ODQxZWQ4NDY2MTIzNDgyMzRlMzU0OTdm",
        base_url="https://maas-api.cn-huabei-1.xf-yun.com/v2",
    )
    xf_model = "xopqwen36v35b"

    counter = [0]
    errors = [0]

    print("\n[launch] 2 workers:", flush=True)
    print(f"  agnes:  {len(agnes_batches)} batches ({len(agnes_batches) * args.batch_size} words)", flush=True)
    print(f"  xunfei: {len(xunfei_batches)} batches ({len(xunfei_batches) * args.batch_size} words)", flush=True)
    print(flush=True)

    t0 = time.perf_counter()

    # Run both workers concurrently
    agnes_result, xf_result = await asyncio.gather(
        _worker("agnes", agnes_client, agnes_model, agnes_batches, counter, errors, args.batch_size),
        _worker("xunfei", xf_client, xf_model, xunfei_batches, counter, errors, args.batch_size),
    )

    elapsed_total = time.perf_counter() - t0
    agnes_done, agnes_errs = agnes_result
    xf_done, xf_errs = xf_result

    print(f"\n[done] total={counter[0]} errors={errors[0]} elapsed={elapsed_total:.0f}s", flush=True)
    print(f"  agnes:  {agnes_done} words, {agnes_errs} errors", flush=True)
    print(f"  xunfei: {xf_done} words, {xf_errs} errors", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

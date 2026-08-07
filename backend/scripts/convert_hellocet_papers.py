#!/usr/bin/env python
"""Convert HelloCET papers (JSON) into SeeWord standardized 真题 JSON files.

Source repo: https://github.com/HashCookie/HelloCET — public/papers/{cet4,cet6}/...
Each paper is `<year>-<month>-<set>.json` with a sibling `.answers.json`.

Only the reading part (questions 26-55, auto-gradable objective items) is
converted; listening needs audio, writing/translation are subjective.

Output schema (one JSON array per level file, written to data/papers/):
    [
      {
        "level": "cet4", "year": 2018, "month": 6, "set_no": 1,
        "title": "2018年6月大学英语四级考试真题（第1套）",
        "source": "HelloCET (github.com/HashCookie/HelloCET)",
        "questions": [
          {
            "section": "reading_A", "number": 26,
            "question_type": "cloze",
            "passage": "…passage text…\n\n[word bank] A) … B) …",
            "question": null,
            "options": null,
            "answer": "H",
            "explanation": null
          },
          {
            "section": "reading_C", "number": 46,
            "question_type": "reading",
            "passage": "…passage…",
            "question": "What do we learn …?",
            "options": {"A": "…", "B": "…", "C": "…", "D": "…"},
            "answer": "B",
            "explanation": null
          }
        ]
      }
    ]

Usage:
    python scripts/convert_hellocet_papers.py <hellocet_papers_dir> [--out data/papers]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _clean(text: str | None) -> str:
    return (text or "").strip()


def _build_cloze(paper: dict, answers: dict) -> list[dict]:
    """Section A — word-bank cloze (questions 26-35)."""
    sa = (paper.get("readingComprehension") or {}).get("sectionA") or {}
    passages = sa.get("passages") or []
    bank = sa.get("options") or {}
    bank_text = "\n".join(f"{k}) {v}" for k, v in sorted(bank.items()))
    passage_text = "\n\n".join(_clean(p) for p in passages if _clean(p)) + (
        f"\n\n[word bank]\n{bank_text}" if bank_text else ""
    )

    ans_map = {
        a["number"]: _clean(a.get("answer", "")).upper()
        for a in (answers.get("readingAnswers") or {}).get("sectionA") or []
    }
    out: list[dict] = []
    for num in range(26, 36):
        if num not in ans_map:
            continue
        out.append(
            {
                "section": "reading_A",
                "number": num,
                "question_type": "cloze",
                "passage": passage_text,
                "question": None,
                "options": None,
                "answer": ans_map[num],
                "explanation": None,
            }
        )
    return out


def _build_matching(paper: dict, answers: dict) -> list[dict]:
    """Section B — paragraph matching (questions 36-45)."""
    sb = (paper.get("readingComprehension") or {}).get("sectionB") or {}
    passages = sb.get("passages") or []
    passage_text = "\n\n".join(_clean(p) for p in passages if _clean(p))
    qs = sb.get("questions") or []

    ans_map = {
        a["number"]: _clean(a.get("answer", "")).upper()
        for a in (answers.get("readingAnswers") or {}).get("sectionB") or []
    }
    out: list[dict] = []
    for q in qs:
        num = q.get("number")
        if num not in ans_map:
            continue
        out.append(
            {
                "section": "reading_B",
                "number": num,
                "question_type": "matching",
                "passage": passage_text,
                "question": _clean(q.get("statement")),
                "options": None,
                "answer": ans_map[num],
                "explanation": None,
            }
        )
    return out


def _build_reading(paper: dict, answers: dict) -> list[dict]:
    """Section C — careful reading (questions 46-55)."""
    sc = (paper.get("readingComprehension") or {}).get("sectionC") or {}
    answers_sc = (answers.get("readingAnswers") or {}).get("sectionC") or {}
    out: list[dict] = []

    blocks = [
        ("reading_C", "passagesOne", "questionsOne", "passageOne", 46),
        ("reading_C", "passagesTwo", "questionsTwo", "passageTwo", 51),
    ]
    for section, passages_key, questions_key, answers_key, _base_num in blocks:
        passage_text = "\n\n".join(_clean(p) for p in sc.get(passages_key) or [] if _clean(p))
        ans_map = {
            a["number"]: (_clean(a.get("answer", "")).upper(), _clean(a.get("explanation")))
            for a in answers_sc.get(answers_key) or []
        }
        for q in sc.get(questions_key) or []:
            num = q.get("number")
            if num not in ans_map:
                continue
            answer, explanation = ans_map[num]
            options = {k: _clean(v) for k, v in (q.get("options") or {}).items() if _clean(v)}
            out.append(
                {
                    "section": section,
                    "number": num,
                    "question_type": "reading",
                    "passage": passage_text,
                    "question": _clean(q.get("statement")),
                    "options": options if len(options) >= 2 else None,
                    "answer": answer,
                    "explanation": explanation or None,
                }
            )
    return out


def convert_paper(p_path: Path, a_path: Path) -> dict | None:
    """Convert one paper + answers pair into a standardized record."""
    try:
        paper = json.loads(p_path.read_text(encoding="utf-8"))
        answers = json.loads(a_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"[error] failed to parse {p_path.name}: {e}", file=sys.stderr)
        return None

    # Path shape: <papers_dir>/<cet4|cet6>/<year>/<month>/<year>-<month>-<set>.json
    level_dir = p_path.parent.parent.parent.name  # cet4 / cet6
    year = int(paper.get("year") or 0)
    month = int(paper.get("month") or 0)
    if not year or not month:
        print(f"[error] {p_path.name}: missing year/month", file=sys.stderr)
        return None
    set_no = int(p_path.stem.split("-")[-1] or 1)

    level_labels = {"cet4": "大学英语四级", "cet6": "大学英语六级"}
    label = level_labels.get(level_dir, "英语考试")
    title = f"{year}年{month}月{label}考试真题（第{set_no}套）"

    questions = _build_cloze(paper, answers) + _build_matching(paper, answers) + _build_reading(paper, answers)
    questions.sort(key=lambda q: q["number"])
    if not questions:
        print(f"[warn] {p_path.name}: no objective questions extracted", file=sys.stderr)
        return None

    return {
        "level": level_dir,
        "year": year,
        "month": month,
        "set_no": set_no,
        "title": title,
        "source": "HelloCET (github.com/HashCookie/HelloCET)",
        "questions": questions,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("papers_dir", help="HelloCET public/papers directory")
    parser.add_argument("--out", default="data/papers", help="output directory for standardized JSON")
    args = parser.parse_args()

    src = Path(args.papers_dir)
    if not src.is_dir():
        print(f"[error] not a directory: {src}", file=sys.stderr)
        return 1

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    by_level: dict[str, list[dict]] = {}
    for p_path in sorted(src.glob("*/**/*.json")):
        if p_path.name.endswith(".answers.json"):
            continue
        a_path = p_path.with_name(p_path.stem + ".answers.json")
        if not a_path.exists():
            print(f"[skip] {p_path.name}: no answers file", file=sys.stderr)
            continue
        rec = convert_paper(p_path, a_path)
        if rec:
            by_level.setdefault(rec["level"], []).append(rec)

    total = 0
    for level, records in sorted(by_level.items()):
        records.sort(key=lambda r: (r["year"], r["month"], r["set_no"]))
        dest = out_dir / f"papers_{level}.json"
        dest.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")
        q_count = sum(len(r["questions"]) for r in records)
        print(f"[ok] {level}: {len(records)} papers, {q_count} questions -> {dest}")
        total += len(records)
    print(f"[done] {total} papers written to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

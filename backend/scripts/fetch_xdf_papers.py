#!/usr/bin/env python
"""Fetch & parse CET past-paper reading sections from cet4-6.xdf.cn pages.

Two page layouts are handled:
  * 2025-06 style: one <p> per section, lines separated by <br/>
  * 2024-12/2025-12 style: one <p> per line, sections span many paragraphs

Extracts Section A (选词填空) + Section B (段落匹配) with answers; Section C
(仔细阅读) questions are kept only when the page provides >=2 options (some
pages list only the correct option, which can't be quizzed).

Usage:
    python scripts/fetch_xdf_papers.py <url> [--out out.json]
    python scripts/fetch_xdf_papers.py urls.txt
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _clean(s: str) -> str:
    s = _HTML_TAG_RE.sub(" ", s)
    s = re.sub(r"[ \t\r]+\n", "\n", s)
    return re.sub(r"\n{2,}", "\n", s).strip()


def _paragraphs(html: str) -> list[str]:
    """Extract <p> blocks with <br/> flattened to newlines."""
    out: list[str] = []
    for m in re.finditer(r"<p[^>]*>([\s\S]*?)</p>", html):
        raw = m.group(1)
        raw = raw.replace("<br/>", "\n").replace("<br>", "\n").replace("<br />", "\n")
        text = _clean(raw)
        if len(text) > 2:
            out.append(text)
    return out


def _all_lines(paras: list[str]) -> list[str]:
    """Flatten paragraphs into lines (both layouts)."""
    lines: list[str] = []
    for p in paras:
        for line in p.splitlines():
            line = line.strip()
            if line:
                lines.append(line)
    return lines


# --- regexes ----------------------------------------------------------------

# answer lines tolerate missing/spaced letters: "26-30 NIFEH 31-35ALKJC" or
# "26-30 HJ GCM；31-35 FDKLA" (full-width separators allowed)
_ANS_A = re.compile(r"26\s*[-—]\s*30\s*([A-O](?:\s*[A-O]){4})[^A-O]*?31\s*[-—]\s*35\s*([A-O](?:\s*[A-O]){4})")
_ANS_B = re.compile(r"36\s*[-—]\s*40\s*([A-Z](?:\s*[A-Z]){4})[^A-Z]*?41\s*[-—]\s*45\s*([A-Z](?:\s*[A-Z]){4})")
_ANS_C1 = re.compile(r"46\s*[-—]\s*50\s*([A-D](?:\s*[A-D]){4})")
_ANS_C2 = re.compile(r"51\s*[-—]\s*55\s*([A-D](?:\s*[A-D]){4})")

# "26.N)unique" or "1.J) intrigued" (some pages OCR the letter I as digit 1)
_OPTION_ITEM = re.compile(r"^(\d+)\.\s*([A-O1])\)\s*(.+)$")
# "46.Question text" (question lines)
_Q_LINE = re.compile(r"^(\d+)\.\s*(.+)$")
# "A) option text"
_OPT_C = re.compile(r"^([A-D])\)\s*(.+)$")
# "36.B【定位】..." answer-with-location lines
_ANS_B_LINE = re.compile(r"^(\d+)\.\s*([A-Z])(?:【定位】|【答案】|\s)")
# bare statement "36. People going to the library..." (no answer letter)
_Q_LINE = re.compile(r"^(\d+)\.\s*(.+)$")


def _extract_answers(lines: list[str]) -> tuple[dict[int, str], list[str]]:
    """Pull answer strings for A/B/C from the page; returns (answers, bank_lines)."""
    text = "\n".join(lines)
    ans: dict[int, str] = {}
    bank: list[str] = []

    ma = _ANS_A.search(text)
    if ma:
        for i, ch in enumerate(re.sub(r"\s+", "", ma.group(1) + ma.group(2))):
            ans[26 + i] = ch
    mb = _ANS_B.search(text)
    if mb:
        for i, ch in enumerate(re.sub(r"\s+", "", mb.group(1) + mb.group(2))):
            ans[36 + i] = ch
    m1 = _ANS_C1.search(text)
    m2 = _ANS_C2.search(text)
    if m1:
        for i, ch in enumerate(re.sub(r"\s+", "", m1.group(1))):
            ans[46 + i] = ch
    if m2:
        for i, ch in enumerate(re.sub(r"\s+", "", m2.group(1))):
            ans[51 + i] = ch

    for line in lines:
        om = _OPTION_ITEM.match(line)
        if om and 26 <= int(om.group(1)) <= 35:
            bank.append(f"{om.group(2)}) {om.group(3)}")
    return ans, bank


def _parse(lines: list[str], answers: dict[int, str], bank: list[str]) -> list[dict]:
    """Stream-parse the flattened lines into question dicts.

    Sections are inferred from question numbers (26-35 cloze / 36-45 matching /
    46-55 reading) because some pages omit the Section A/B/C markers. Word-bank
    entries come numbered either 1-15 (2025-06 style) or 26-35 (2024-12 style).
    """
    questions: list[dict] = []
    cur_c: dict | None = None  # current Section C question being assembled

    for line in lines:
        # Section A: numbered option-bank entries (1-15 or 26-35)
        om = _OPTION_ITEM.match(line)
        if om:
            num = int(om.group(1))
            q_num = num + 25 if 1 <= num <= 15 else num
            if 26 <= q_num <= 35:
                questions.append(
                    {
                        "section": "reading_A",
                        "number": q_num,
                        "question_type": "cloze",
                        "passage": None,
                        "question": None,
                        "options": None,
                        "answer": answers.get(q_num),
                        "explanation": None,
                    }
                )
                continue
        # Section B: statement lines and answer lines with letter
        abm = _ANS_B_LINE.match(line)
        if abm and 36 <= int(abm.group(1)) <= 45:
            num = int(abm.group(1))
            existing = next((q for q in questions if q["section"] == "reading_B" and q["number"] == num), None)
            if existing:
                existing["answer"] = abm.group(2)
            else:
                questions.append(
                    {
                        "section": "reading_B",
                        "number": num,
                        "question_type": "matching",
                        "passage": None,
                        "question": None,
                        "options": None,
                        "answer": abm.group(2),
                        "explanation": None,
                    }
                )
            continue
        qm = _Q_LINE.match(line)
        if qm:
            num = int(qm.group(1))
            if 36 <= num <= 45:
                questions.append(
                    {
                        "section": "reading_B",
                        "number": num,
                        "question_type": "matching",
                        "passage": None,
                        "question": qm.group(2),
                        "options": None,
                        "answer": answers.get(num),
                        "explanation": None,
                    }
                )
                continue
            if 46 <= num <= 55:
                cur_c = {
                    "section": "reading_C",
                    "number": num,
                    "question_type": "reading",
                    "passage": None,
                    "question": qm.group(2),
                    "options": {},
                    "answer": answers.get(num),
                    "explanation": None,
                }
                questions.append(cur_c)
                continue
        oc = _OPT_C.match(line)
        if oc and cur_c is not None:
            cur_c["options"][oc.group(1)] = oc.group(2)

    # attach the word bank to the first reading_A passage (bank text for display)
    if bank and any(q["section"] == "reading_A" for q in questions):
        bank_text = " ".join(bank)
        for q in questions:
            if q["section"] == "reading_A" and q["number"] == 26:
                q["passage"] = f"[word bank] {bank_text}"
                break
    return questions


def parse_page(url: str) -> dict | None:
    page_html = _fetch(url)
    paras = _paragraphs(page_html)
    title = html.unescape(paras[0] if paras else "")
    # keep only the core paper label, e.g. "2025年12月大学英语四级阅读试题及答案（第一套）"
    core = re.search(r"\d{4}年\d{1,2}月[^，。！、；]{0,60}", title)
    if core:
        title = core.group(0)
    title = title[:200]
    tm = re.search(r"(\d{4})年(\d{1,2})月", title)
    # Level detection must not trip on the "四六级" marketing text in the
    # intro paragraph — match the paper-specific pattern instead.
    lm = re.search(r"(四级|六级)(?:阅读)?试题及答案|英语(四级|六级)", title)
    level = ""
    if lm:
        hit = lm.group(1) or lm.group(2)
        level = "cet4" if hit == "四级" else "cet6"
    if not tm or not level:
        print(f"[skip] {url}: cannot determine year/month/level: {title[:80]}", file=sys.stderr)
        return None
    setm = re.search(r"第\s*(?:([一二三四])|(\d))\s*套", title)
    if setm:
        cn = {"一": 1, "二": 2, "三": 3, "四": 4}
        set_no = int(setm.group(2)) if setm.group(2) else cn.get(setm.group(1), 1)
    else:
        set_no = 1

    lines = _all_lines(paras)
    answers, bank = _extract_answers(lines)
    if not answers:
        print(f"[skip] {url}: no answer keys found", file=sys.stderr)
        return None

    questions = _parse(lines, answers, bank)
    # keep Section C only when it has full options
    kept = [q for q in questions if not (q["section"] == "reading_C" and len(q.get("options") or {}) < 2)]
    dropped = len(questions) - len(kept)
    if dropped:
        print(f"[warn] {url}: dropped {dropped} reading_C (incomplete options)", file=sys.stderr)
    questions = kept
    if not questions:
        print(f"[skip] {url}: no usable questions after filtering", file=sys.stderr)
        return None

    # de-dup by (section, number) keeping the first
    seen: set[tuple[str, int]] = set()
    uniq: list[dict] = []
    for q in questions:
        key = (q["section"], q["number"])
        if key not in seen:
            seen.add(key)
            uniq.append(q)
    questions = sorted(uniq, key=lambda q: (q["section"], q["number"]))

    return {
        "level": level,
        "year": int(tm.group(1)),
        "month": int(tm.group(2)),
        "set_no": set_no,
        "title": title,
        "source": f"cet4-6.xdf.cn ({url})",
        "questions": questions,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", help="URL or a file of URLs (one per line)")
    parser.add_argument("--out", help="output JSON path (single URL only)")
    args = parser.parse_args()

    inp = Path(args.input)
    urls = [args.input]
    if inp.is_file():
        urls = [u.strip() for u in inp.read_text(encoding="utf-8").splitlines() if u.strip()]

    records = [r for r in (parse_page(u) for u in urls) if r is not None]
    if not records:
        print("[error] nothing parsed", file=sys.stderr)
        return 1
    if args.out:
        Path(args.out).write_text(
            json.dumps(records if len(records) > 1 else records[0], ensure_ascii=False, indent=1), encoding="utf-8"
        )
        print(f"[ok] {len(records)} paper(s) -> {args.out}")
    else:
        for r in records:
            secs: dict[str, int] = {}
            for q in r["questions"]:
                secs[q["section"]] = secs.get(q["section"], 0) + 1
            print(f"[ok] {r['level']} {r['year']}-{r['month']} set{r['set_no']}: {len(r['questions'])}q {secs}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

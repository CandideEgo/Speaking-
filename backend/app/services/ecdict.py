"""ECDICT-backed exam-word lookup service.

Loads ECDICT (skywind3000/ECDICT, MIT) read-only and builds a compact index of
exam-relevant words only — those whose ``tag`` field carries a CET / 高考 / 考研
/ 雅思 / 托福 / GRE marker. For each such word the ``exchange`` field is parsed
to build a reverse inflection index (inflected surface form -> lemma), so
subtitle tokens like "running" / "ran" / "books" resolve to their lemma
("run" / "book") before lookup.

The full ECDICT database is ~770k rows / 30MB; indexing only exam-tagged words
keeps memory small and load fast, which is all the CET feature needs (non-exam
words are never annotated).

Run ``python scripts/download_ecdict.py`` to place the database at
``backend/data/ecdict.db`` before using. When the DB is absent (e.g. CI),
``is_available()`` returns False and ``lookup`` returns None — callers should
skip annotation gracefully.
"""

from __future__ import annotations

import re
import sqlite3
import threading
from pathlib import Path

from app.core.exam_levels import EXAM_LEVELS

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "ecdict.db"

# BNC frequency rank at or below which a word is treated as a stopword (function
# word / ultra-common). ECDICT tags these with zk/gk, but annotating "the/a/to/of"
# would flood subtitles. Tuned so content words like "book"(235)/"run"(208) are
# kept while "the"(1)/"to"(7)/"of"/"and"/"is" are dropped.
STOPWORD_BNC_RANK = 100

# Map ECDICT ``tag`` tokens to our canonical level keys (app.core.exam_levels).
# ECDICT tag tokens are verified at load via ``seen_tags()``; unknown tokens are
# ignored. Variants are covered defensively in case of release differences.
ECDICT_TAG_MAP: dict[str, str] = {
    "zk": "zhongkao",
    "zhongkao": "zhongkao",
    "gk": "gaoKao",
    "gaokao": "gaoKao",
    "cet4": "cet4",
    "cet-4": "cet4",
    "cet6": "cet6",
    "cet-6": "cet6",
    "ky": "ky",
    "kaoyan": "ky",
    "ielts": "ielts",
    "toefl": "toefl",
    "gre": "gre",
}

# ECDICT ``exchange`` field: "p:ran/d:run/i:running/3:runs" — code:inflected pairs.
_EXCHANGE_PAIR_RE = re.compile(r"([a-zA-Z0-9]+):([^/]+)")

# Allowlist of exchange codes whose value is a real inflected surface form
# (verified against the full ECDICT database). Only these contribute to the
# reverse inflection index; every other code is rejected by default.
#   s = 3rd-person singular / plural     p = past tense      d = past participle
#   i = present participle (ing)         r = comparative      t = superlative
#   3 = 3rd-person singular (variant)    f = plural variant
#   b = comparative variant              z = superlative variant
_FORWARD_FORM_CODES = frozenset({"s", "p", "d", "i", "r", "t", "3", "f", "b", "z"})
# Codes NOT in this allowlist and why they must be excluded:
#   0 = lemma reverse-pointer (best's "0:good" means best inflects FROM good —
#       direction is backwards; including it would map inflected["good"]->"best"
#       so a click on "good" resolves to "best").
#   1 = inflection-type marker, NOT a word form ("1:t" tags best as a superlative,
#       "1:i" tags an ing-form — the value is a code like t/i/pd, not a word;
#       including it pollutes inflected["i"]/inflected["t"]/... and makes a click
#       on the common token "I" resolve to e.g. "abiding").
#   Any future unknown code is rejected by default-deny — that is the point of an
#   allowlist: we never have to chase new reverse/type codes one by one.
# Strip everything but lowercase letters and apostrophes when normalising tokens.
_TOKEN_CLEAN_RE = re.compile(r"[^a-z']")
# Word tokens within a subtitle line (keeps apostrophes for contractions).
_WORD_TOKEN_RE = re.compile(r"[A-Za-z']+")

_lock = threading.Lock()
_index: _ECDICTIndex | None = None  # cached index, built lazily


class _ECDICTIndex:
    """Compact in-memory index of exam-relevant ECDICT entries."""

    __slots__ = ("inflected", "seen_tags", "words")

    def __init__(self) -> None:
        # lemma (lowercase) -> entry dict
        self.words: dict[str, dict] = {}
        # inflected surface form (lowercase) -> lemma (lowercase)
        self.inflected: dict[str, str] = {}
        # raw tag tokens actually seen in the DB (for verifying ECDICT_TAG_MAP)
        self.seen_tags: set[str] = set()


def levels_of(tag_str: str | None) -> list[str]:
    """Parse an ECDICT tag string into canonical level keys (deduped, stable order)."""
    if not tag_str:
        return []
    levels: list[str] = []
    seen: set[str] = set()
    for tok in tag_str.split():
        key = ECDICT_TAG_MAP.get(tok)
        if key and key not in seen:
            seen.add(key)
            levels.append(key)
    return levels


def _parse_exchange(exchange: str | None) -> list[str]:
    """Return inflected surface forms declared by an ECDICT entry's ``exchange`` field.

    Uses an allowlist of forward-form codes (``_FORWARD_FORM_CODES``): only codes
    whose value is a real inflected word form (s/p/d/i/r/t/3/f/b/z) contribute.

    Code ``0`` (lemma reverse-pointer — best's ``0:good`` means best inflects
    FROM good) is rejected because its direction is backwards; including it would
    create wrong mappings like inflected["good"] -> "best". Code ``1`` (inflection
    -type marker — ``1:t`` tags best as a superlative) is rejected because its
    value is a code, not a word; including it would pollute inflected["i"]/
    inflected["t"]/... and make a click on the common token "I" resolve to e.g.
    "abiding". Any future unknown code is rejected by default-deny.
    """
    if not exchange:
        return []
    forms: list[str] = []
    for code, form in _EXCHANGE_PAIR_RE.findall(exchange):
        # Allowlist: only forward-form codes contribute real inflected forms.
        # This rejects 0 (reverse pointer), 1 (type marker), and unknowns.
        if code not in _FORWARD_FORM_CODES:
            continue
        if form and form != "0":
            forms.append(form.lower())
    return forms


def is_available() -> bool:
    """True if the ECDICT database file is present on disk."""
    return DB_PATH.exists()


def _build_index() -> _ECDICTIndex:
    idx = _ECDICTIndex()
    if not is_available():
        return idx
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        conn.row_factory = sqlite3.Row
        # Only rows with a non-empty tag can carry exam markers; everything else
        # is irrelevant to the CET feature and skipped to keep the index small.
        cur = conn.execute(
            "SELECT word, phonetic, definition, translation, pos, tag, exchange, bnc, frq "
            "FROM stardict WHERE tag IS NOT NULL AND tag <> ''"
        )
        for row in cur:
            tag_str = row["tag"]
            for tok in tag_str.split():
                idx.seen_tags.add(tok)
            levels = levels_of(tag_str)
            if not levels:
                continue
            lemma = (row["word"] or "").strip().lower()
            if not lemma:
                continue
            # Single-letter "words" (i, a, x) in ECDICT are noise — e.g. "is" is
            # recorded as an inflection of lemma "i" (the letter), which would
            # wrongly annotate "is" in subtitles. Drop them.
            if len(lemma) < 2:
                continue
            # BNC rank <= STOPWORD_BNC_RANK means the word is among the most
            # common function words (the/a/to/of/and/...). These carry exam
            # tags (zk/gk) in ECDICT but annotating them would flood subtitles
            # with highlights — skip them so only content words get annotated.
            bnc = row["bnc"] if isinstance(row["bnc"], int) else 0
            if 0 < bnc <= STOPWORD_BNC_RANK:
                continue
            idx.words[lemma] = {
                "lemma": lemma,
                "phonetic": row["phonetic"],
                "definition": row["definition"],
                "translation": row["translation"],
                "pos": row["pos"],
                "tags": tag_str,
                "levels": levels,
                "bnc": bnc,
            }
            for form in _parse_exchange(row["exchange"]):
                # First lemma wins on collision (deterministic given row order).
                idx.inflected.setdefault(form, lemma)
    finally:
        conn.close()
    return idx


def get_index() -> _ECDICTIndex | None:
    """Return the cached exam-word index, building it on first call.

    Returns an empty index (not None) when the DB is missing, so callers can
    treat lookup results uniformly; use ``is_available()`` to distinguish.
    """
    global _index
    if _index is not None:
        return _index
    with _lock:
        if _index is not None:
            return _index
        _index = _build_index()
    return _index


def _clean_token(token: str) -> str:
    return _TOKEN_CLEAN_RE.sub("", token.lower())


def lookup(token: str) -> dict | None:
    """Look up a subtitle token; return an entry dict (with ``levels``) or None.

    Resolves inflections (running -> run) via the reverse exchange index, then
    falls back to a direct lemma match.
    """
    idx = get_index()
    if idx is None or not idx.words:
        return None
    clean = _clean_token(token)
    if not clean:
        return None
    # 1. direct lemma match
    entry = idx.words.get(clean)
    if entry is not None:
        return entry
    # 2. inflection reverse index
    lemma = idx.inflected.get(clean)
    if lemma is not None:
        return idx.words.get(lemma)
    return None


def seen_tags() -> set[str]:
    """Raw tag tokens present in the loaded DB — for verifying ECDICT_TAG_MAP coverage."""
    idx = get_index()
    return idx.seen_tags if idx else set()


def annotate_text(text: str) -> dict[str, list[str]]:
    """Tokenize a subtitle line and return ``{surface: [level keys]}`` for exam words.

    Keys are the lowercased, punctuation-stripped surface form as it appears in
    the text (e.g. "running", not the lemma "run"), so the frontend can match
    rendered tokens directly without a lemmatizer. The ECDICT entry (with lemma,
    phonetic, definitions) is fetched on demand via the gloss endpoint.

    Used by the ingest pipeline and the backfill script to populate
    ``Subtitle.word_levels``. Returns an empty dict when ECDICT is unavailable
    or no exam words are found.
    """
    idx = get_index()
    if idx is None or not idx.words:
        return {}
    out: dict[str, list[str]] = {}
    for token in _WORD_TOKEN_RE.findall(text or ""):
        entry = lookup(token)
        if entry:
            surface = _clean_token(token)
            if surface:
                out[surface] = entry["levels"]
    return out


def verify_tag_coverage() -> dict[str, list[str]]:
    """Report ECDICT tag tokens not mapped to any level key (for startup logging)."""
    seen = seen_tags()
    unmapped = sorted(t for t in seen if t not in ECDICT_TAG_MAP)
    mapped = sorted(set(seen) & set(ECDICT_TAG_MAP))
    # Confirm we actually found each canonical level in the DB.
    missing_levels = sorted(lvl for lvl in EXAM_LEVELS if not any(ECDICT_TAG_MAP.get(t) == lvl for t in mapped))
    return {"mapped": mapped, "unmapped": unmapped, "missing_levels": missing_levels}

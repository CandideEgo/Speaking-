"""Tests for the ECDICT exam-word lookup service (app.services.ecdict).

The real ~30MB ECDICT database isn't available in CI, so these tests verify
the tag-parsing / exchange-parsing logic as pure functions, plus lookup and
annotate_text against a hand-built in-memory index (monkeypatched in).
A smoke test that loads the real DB is included but skipped when the DB is
absent (CI); run it locally to verify the exchange-parsing fix end-to-end.
"""

import pytest

from app.services import ecdict


def test_levels_of_maps_known_tags_and_filters_unknown():
    assert ecdict.levels_of("cet4 cet6") == ["cet4", "cet6"]
    assert ecdict.levels_of("gk cet4 ielts") == ["gaoKao", "cet4", "ielts"]
    # non-exam tags are ignored
    assert ecdict.levels_of("bnc frq collins") == []
    assert ecdict.levels_of(None) == []
    assert ecdict.levels_of("") == []


def test_levels_of_dedupes():
    # same key via two tokens shouldn't duplicate
    assert ecdict.levels_of("gk gaokao") == ["gaoKao"]


def test_parse_exchange_extracts_inflected_forms():
    forms = ecdict._parse_exchange("p:ran/d:run/i:running/3:runs")
    assert forms == ["ran", "run", "running", "runs"]
    # "0" / empty mean "no inflection" — skipped
    assert ecdict._parse_exchange("p:0/i:") == []
    assert ecdict._parse_exchange(None) == []
    assert ecdict._parse_exchange("") == []


def test_parse_exchange_rejects_reverse_pointer_and_type_codes():
    # best's real exchange: "3:bests/0:good/1:t"
    #   3:bests  -> forward form (3rd-person singular) -> KEEP "bests"
    #   0:good   -> lemma reverse-pointer              -> REJECT
    #               (would map inflected["good"] -> "best", so clicking "good"
    #                showed "best")
    #   1:t      -> inflection-type marker             -> REJECT
    #               (the value "t" is a code, not a word; would pollute
    #                inflected["t"]/inflected["i"]/... so clicking the common
    #                token "I" resolved to e.g. "abiding")
    forms = ecdict._parse_exchange("3:bests/0:good/1:t")
    assert "good" not in forms
    assert "t" not in forms  # code 1's value must not leak as a form
    assert forms == ["bests"]


def test_reverse_index_not_polluted_by_lemma_pointer_or_type_codes(monkeypatch):
    """End-to-end invariant: building the reverse index from best's real exchange
    must NOT create entries for the lemma pointer (good) or type-marker values
    (t/i/...), so lookup("good")/lookup("I") don't get hijacked into best/abiding.

    This locks the *root cause* (reverse-index direction correctness), not the
    implementation detail of which function skips which code.
    """
    idx = ecdict._ECDICTIndex()
    idx.words = {
        "best": {
            "lemma": "best",
            "phonetic": "best",
            "definition": "of the highest quality",
            "translation": "最好的",
            "pos": "adj",
            "tags": "ielts",
            "levels": ["ielts"],
        },
    }
    # Mirror _build_index: feed best's exchange through _parse_exchange and map
    # each returned form -> "best" (first-lemma-wins, as in ecdict.py).
    for form in ecdict._parse_exchange("3:bests/0:good/1:t"):
        idx.inflected.setdefault(form, "best")
    monkeypatch.setattr(ecdict, "_index", idx)

    # lemma reverse-pointer must not enter the reverse index
    assert "good" not in idx.inflected
    # type-marker values must not leak in as forms
    assert "t" not in idx.inflected
    assert "i" not in idx.inflected
    # only the real forward form made it in
    assert idx.inflected == {"bests": "best"}
    # end-to-end: clicking good / I resolves to nothing, not best / abiding
    assert ecdict.lookup("good") is None
    assert ecdict.lookup("I") is None
    assert ecdict.lookup("i") is None
    # the real inflection still resolves correctly
    assert ecdict.lookup("bests")["lemma"] == "best"


def _fake_index() -> "ecdict._ECDICTIndex":
    idx = ecdict._ECDICTIndex()
    idx.words = {
        "run": {
            "lemma": "run",
            "phonetic": "rʌn",
            "definition": "to move fast on foot",
            "translation": "跑",
            "pos": "v",
            "tags": "cet4 cet6",
            "levels": ["cet4", "cet6"],
        },
        "fast": {
            "lemma": "fast",
            "phonetic": "fɑːst",
            "definition": "quick",
            "translation": "快的",
            "pos": "adj",
            "tags": "cet4",
            "levels": ["cet4"],
        },
    }
    idx.inflected = {"running": "run", "ran": "run", "runs": "run"}
    idx.seen_tags = {"cet4", "cet6"}
    return idx


def test_lookup_resolves_inflection_via_reverse_index(monkeypatch):
    monkeypatch.setattr(ecdict, "_index", _fake_index())
    entry = ecdict.lookup("running")
    assert entry is not None
    assert entry["lemma"] == "run"
    assert entry["levels"] == ["cet4", "cet6"]


def test_lookup_strips_punctuation_and_is_case_insensitive(monkeypatch):
    monkeypatch.setattr(ecdict, "_index", _fake_index())
    assert ecdict.lookup("Run!")["lemma"] == "run"
    assert ecdict.lookup("Fast,")["lemma"] == "fast"


def test_lookup_returns_none_for_unknown(monkeypatch):
    monkeypatch.setattr(ecdict, "_index", _fake_index())
    assert ecdict.lookup("zzzznotaword") is None


def test_lookup_returns_none_when_db_missing(monkeypatch):
    # No index built and no DB on disk -> graceful None.
    monkeypatch.setattr(ecdict, "is_available", lambda: False)
    monkeypatch.setattr(ecdict, "_index", None)
    assert ecdict.lookup("run") is None


def test_annotate_text_keys_by_surface_form(monkeypatch):
    """word_levels keys are surface tokens (running), not lemmas (run),
    so the frontend can match rendered tokens directly."""
    monkeypatch.setattr(ecdict, "_index", _fake_index())
    result = ecdict.annotate_text("I am running fast today.")
    assert result == {"running": ["cet4", "cet6"], "fast": ["cet4"]}
    # "I", "am", "today" are not exam words -> absent from the map.


def test_annotate_text_empty_when_db_missing(monkeypatch):
    monkeypatch.setattr(ecdict, "is_available", lambda: False)
    monkeypatch.setattr(ecdict, "_index", None)
    assert ecdict.annotate_text("anything goes here") == {}


@pytest.mark.skipif(not ecdict.is_available(), reason="ECDICT db not present (CI)")
def test_real_db_good_and_single_letters_not_hijacked():
    """Smoke test against the real ECDICT db (local only, skipped in CI).

    Verifies the exchange-parsing allowlist end-to-end on real data: ``good``
    (a stopword, bnc=73) is not hijacked into ``best`` via best's ``0:good``
    reverse pointer, and single-letter inflection-type markers (``1:t``/``1:i``)
    don't pollute the reverse index so the common token ``I`` doesn't resolve to
    e.g. ``abiding``.
    """
    idx = ecdict.get_index()
    # lemma reverse-pointer must not enter the reverse index
    assert "good" not in idx.inflected
    assert ecdict.lookup("good") is None
    # single-letter type-marker values must not leak in as forms
    assert "i" not in idx.inflected
    assert "t" not in idx.inflected
    assert ecdict.lookup("I") is None
    assert ecdict.lookup("i") is None
    # best is indexed and resolves to itself (not corrupted by the fix)
    assert ecdict.lookup("best")["lemma"] == "best"

#!/usr/bin/env python3
"""Integrity checks for the repository knowledge layer.

Eight violation checks plus two advisory outputs, all deterministic (no LLM, no network):

  refs         Markdown links resolve; every ADR-00xx reference has a file.
  frontmatter  wiki/ documents carry a valid schema, and every `related_code`
               module exists and still matches at least one real file.
  ownership    Git commit hashes stay in the places allowed to narrate history.
  index        Every entry in decisions.md is either a row in decisions-index.md
               or named on its `Retired N — …` line, and each row agrees with its
               entry on ID, date and title.
  paths        Repo-convention invariants that reduce to a path check.
  budget       The tiers a session loads, plus the two globs that say "this page
               should split". A per-file `limit` is a target, not a gate
               (DEC-062): over it prints a notice and never fails a commit.
  layout       Every top-level entry git tracks is registered in layout.json with
               the layer that owns it, and every registered entry still has
               something tracked there. The doctrine is wiki/guides/repository-layout.md.
  captures     The user's dictated words stay exactly as captured, and every segment of
               them carries a disposition. The doctrine is inbox/README.md.
  stale        Code changed under a module some wiki/ document describes, since
               that document was last verified.

Usage:
    python scripts/check-knowledge/check_knowledge.py            # all checks
    python scripts/check-knowledge/check_knowledge.py refs       # one check
    python scripts/check-knowledge/check_knowledge.py stale      # the reminder alone
    python scripts/check-knowledge/check_knowledge.py --baseline-update
    python scripts/check-knowledge/check_knowledge.py --stamp-refresh --module auth
    python scripts/check-knowledge/check_knowledge.py --capture-seal 2026-09-29-01

Exit code is 0 when clean, 1 when a violation is not already recorded in
knowledge-baseline.json. Baselines are for debt that is scheduled to be paid
off, not for silencing a check -- see README.md.

`stale` notices and the per-file `budget` targets are advisory: they print but do not fail the
run unless `--strict` asks them to -- nobody verifies prose on command, and a byte wall at the
moment of writing buys shorter sentences rather than fewer facts (DEC-062). Faults in
`knowledge-stamps.json` itself do fail, so the reminder cannot quietly stop covering a module.
"""

from __future__ import annotations

import argparse
import datetime
import glob as globlib
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
MODULES_FILE = SCRIPT_DIR / "modules.json"
BUDGET_FILE = SCRIPT_DIR / "knowledge-budget.json"
BASELINE_FILE = SCRIPT_DIR / "knowledge-baseline.json"

# History-narrating locations that are allowed to carry commit hashes.
HASH_ALLOWED_PREFIXES = (
    ".agent/decisions.md",
    # The index mirrors decision titles verbatim, so it inherits whatever they contain.
    ".agent/decisions-index.md",
    ".agent/archive/",
    "docs/adr/",
    "docs/operations/",
    "docs/plans/",
    "docs/progress/",
    "CHANGELOG.md",
)

LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
FENCE_RE = re.compile(r"^[ \t]*```.*?^[ \t]*```", re.DOTALL | re.MULTILINE)
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
PATH_EXT_RE = re.compile(r"\.[A-Za-z0-9]{1,6}$")
ADR_RE = re.compile(r"\bADR-(\d{4})\b")
HASH_RE = re.compile(r"\b[0-9a-f]{7,10}\b")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FM_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.DOTALL)

VALID_STATUS = {"active", "deprecated", "archived"}
VALID_CONFIDENCE = {"verified", "assumed", "unverified"}
# Frozen historical records: correct as of when they were written, not held to
# today's links or schema. ADRs and post-incident reviews are point-in-time by design.
FROZEN_PREFIXES = (".agent/archive/",)
REQUIRED_FM_KEYS = (
    "title", "tags", "status", "confidence", "related_code", "related", "created", "updated",
)
# Documents that describe code must declare which modules they describe;
# guides describe process and may legitimately declare none.
MODULES_REQUIRED_PREFIXES = ("wiki/architecture/", "wiki/problems/")

# `inbox/` holds the user's own dictated words, captured verbatim (inbox/README.md). A raw
# capture is frozen by a content digest, so a prose check it cannot satisfy is a check
# nobody may fix -- those words are not ours to edit.
INBOX_PREFIX = "inbox/"
VERBATIM_SUFFIX = "/raw.md"


def is_verbatim(where: str) -> bool:
    """True for a capture's raw body: the user's words, not the repo's prose."""
    return where.startswith(INBOX_PREFIX) and where.endswith(VERBATIM_SUFFIX)


class Violation:
    __slots__ = ("check", "location", "message")

    def __init__(self, check: str, location: str, message: str) -> None:
        self.check = check
        self.location = location
        self.message = message

    @property
    def fingerprint(self) -> str:
        # Key on the file, not the line: line numbers shift on every edit, and a
        # baseline that breaks whenever text moves is worse than no baseline.
        return f"{self.check}|{re.sub(r':[0-9]+$', '', self.location)}|{self.message}"

    def __str__(self) -> str:
        return f"  {self.location}: {self.message}"


def rel(path: Path) -> str:
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def repo_paths(pattern: str, *, untracked: bool = False) -> list[Path]:
    """Files matching a glob. Tracked-only avoids .venv/node_modules.

    `untracked` also picks up new files that are not yet staged, so a local run
    sees the same tree a commit would.
    """
    commands = [["git", "ls-files", pattern]]
    if untracked:
        commands.append(["git", "ls-files", "--others", "--exclude-standard", pattern])

    found: dict[str, Path] = {}
    for command in commands:
        try:
            out = subprocess.run(
                command, cwd=REPO_ROOT, capture_output=True, text=True, check=True,
            ).stdout
        except (subprocess.CalledProcessError, FileNotFoundError):
            out = "\n".join(globlib.glob(pattern, recursive=True))
        for line in out.splitlines():
            if line.strip():
                found[line.strip()] = REPO_ROOT / line.strip()
    return list(found.values())


def md_files() -> list[Path]:
    return [
        path
        for path in repo_paths("*.md", untracked=True)
        if path.is_file() and not rel(path).startswith(FROZEN_PREFIXES)
    ]


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


# --------------------------------------------------------------------------- refs


def blank_keeping_lines(match: re.Match) -> str:
    return re.sub(r"[^\n]", " ", match.group(0))


def mask_code(text: str) -> str:
    """Blank out fenced and inline code, preserving offsets and line numbers.

    Regex fragments and paths inside code samples are not links; parsing them as
    links produces false positives.
    """
    return INLINE_CODE_RE.sub(blank_keeping_lines, FENCE_RE.sub(blank_keeping_lines, text))


def mask_fences(text: str) -> str:
    """Blank out fenced code only.

    A capture reference inside a fence is an example; the same reference in a table
    cell or a code span is a citation, and citations are what the `captures` check
    resolves.
    """
    return FENCE_RE.sub(blank_keeping_lines, text)


def looks_like_path(target: str) -> bool:
    """Skip targets that cannot name a file (regex fragments, prose, placeholders)."""
    return "/" in target or "\\" in target or bool(PATH_EXT_RE.search(target))


def check_refs(files: list[Path]) -> list[Violation]:
    violations: list[Violation] = []
    adr_numbers = {
        p.name[:4] for p in (REPO_ROOT / "docs" / "adr").glob("*.md") if p.name[:4].isdigit()
    }

    for path in files:
        where = rel(path)
        if is_verbatim(where):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        for lineno, line in enumerate(mask_code(text).splitlines(), start=1):
            for target in LINK_RE.findall(line):
                if target.startswith(("http://", "https://", "mailto:", "tel:", "#")):
                    continue
                clean = target.split("#", 1)[0]
                if not clean or not looks_like_path(clean):
                    continue
                if not (path.parent / clean).resolve().exists():
                    violations.append(
                        Violation("refs", f"{where}:{lineno}", f"broken link -> {target}")
                    )

        # An ADR mention is a reference even inside a code span, so scan raw text.
        for lineno, line in enumerate(text.splitlines(), start=1):
            for number in set(ADR_RE.findall(line)):
                if number not in adr_numbers:
                    violations.append(
                        Violation("refs", f"{where}:{lineno}", f"ADR-{number} has no file in docs/adr/")
                    )

    return violations


# -------------------------------------------------------------------- frontmatter


def parse_frontmatter(text: str) -> dict | None:
    match = FM_RE.match(text)
    if not match:
        return None
    fields: dict = {}
    for raw in match.group(1).splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        key, sep, value = raw.partition(":")
        if sep:
            fields[key.strip()] = value.strip()
    return fields


def parse_list(value: str) -> list[str]:
    inner = value.strip()
    if inner.startswith("[") and inner.endswith("]"):
        inner = inner[1:-1]
    return [item.strip().strip("'\"") for item in inner.split(",") if item.strip()]


def check_frontmatter(files: list[Path], modules: dict) -> list[Violation]:
    violations: list[Violation] = []
    used_modules: set[str] = set()

    for path in files:
        where = rel(path)
        if not where.startswith("wiki/") or where.endswith("INDEX.md"):
            continue

        fields = parse_frontmatter(path.read_text(encoding="utf-8", errors="replace"))
        if fields is None:
            violations.append(Violation("frontmatter", where, "missing YAML frontmatter block"))
            continue

        for key in REQUIRED_FM_KEYS:
            if key not in fields:
                violations.append(Violation("frontmatter", where, f"missing frontmatter key '{key}'"))

        status = fields.get("status", "")
        if status and status not in VALID_STATUS:
            violations.append(
                Violation("frontmatter", where, f"invalid status '{status}' (want {'/'.join(sorted(VALID_STATUS))})")
            )
        confidence = fields.get("confidence", "")
        if confidence and confidence not in VALID_CONFIDENCE:
            violations.append(
                Violation("frontmatter", where, f"invalid confidence '{confidence}'")
            )
        for key in ("created", "updated"):
            value = fields.get(key, "")
            if value and not DATE_RE.match(value):
                violations.append(
                    Violation("frontmatter", where, f"'{key}' is not an ISO date: {value}")
                )
        if fields.get("updated") and fields.get("created") and fields["updated"] < fields["created"]:
            violations.append(Violation("frontmatter", where, "updated is earlier than created"))

        declared = parse_list(fields.get("related_code", ""))
        if not declared and where.startswith(MODULES_REQUIRED_PREFIXES):
            violations.append(
                Violation("frontmatter", where, "related_code is empty; drift cannot be detected")
            )
        for module in declared:
            used_modules.add(module)
            if module not in modules:
                violations.append(
                    Violation("frontmatter", where, f"unknown module '{module}' (not in modules.json)")
                )

        for target in parse_list(fields.get("related", "")):
            if not (REPO_ROOT / target).exists():
                violations.append(
                    Violation("frontmatter", where, f"related path does not exist: {target}")
                )

    for module, spec in modules.items():
        hits = [
            hit
            for pattern in spec["globs"]
            for hit in globlib.glob(pattern, recursive=True, root_dir=REPO_ROOT)
        ]
        if not hits:
            location = f"{rel(MODULES_FILE)}#{module}"
            message = "module matches no file; the code is gone or the glob is wrong"
            if module in used_modules:
                violations.append(Violation("frontmatter", location, message))
            else:
                # Unreferenced and empty: dead vocabulary, worth reporting, not blocking.
                print(f"  note: unused module '{module}' matches no file", file=sys.stderr)

    return violations


# ---------------------------------------------------------------------- ownership


def check_ownership(files: list[Path]) -> list[Violation]:
    violations: list[Violation] = []

    for path in files:
        where = rel(path)
        if not (where.startswith(".agent/") or where.startswith("wiki/")):
            continue
        if where.startswith(HASH_ALLOWED_PREFIXES):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for lineno, line in enumerate(text.splitlines(), start=1):
            for token in set(HASH_RE.findall(line)):
                if not any(char.isdigit() for char in token):
                    continue
                violations.append(
                    Violation(
                        "ownership",
                        f"{where}:{lineno}",
                        f"commit hash '{token}' — history belongs in {'.agent/decisions.md'} or CHANGELOG.md",
                    )
                )

    return violations


# ------------------------------------------------------------------------- budget


def ceiling(spec: dict) -> int:
    """The size a file is actually held to: `limit` plus declared `slack`.

    `slack` is headroom for content this repo does not author by hand — machine-rewritten
    blocks (entry-point injections) or generated sections. Without it, a machine rewrite trips
    the budget for a change no one made by hand.
    """
    return spec["limit"] + spec.get("slack", 0)


def tier_ceiling(spec: dict, files: dict) -> int:
    """A tier's ceiling is its own limit plus its members' slack, and nothing more.

    A tier is the sum of its files, so it cannot be granted slack its members do not
    have — otherwise the tier would pass while every file in it was over.
    """
    return spec["limit"] + sum(files.get(where, {}).get("slack", 0) for where in spec["files"])


def check_budget(budget: dict) -> list[Violation]:
    """The enforced ceilings: tiers, plus the globs that say "this page should split".

    A per-file `limit` is a target, not a gate (DEC-062). Exceeding one prints a notice
    (`budget_notices`) and never fails a commit: a byte wall at the moment of writing
    buys shorter sentences, not fewer facts. What is enforced is the tier — the bytes a
    session actually loads before it knows the task — and the two globs, which catch a
    runaway page rather than save bytes.
    """
    violations: list[Violation] = []
    named = set(budget.get("files", {}))

    for spec in budget.get("globs", []):
        for hit in sorted(globlib.glob(spec["pattern"], recursive=True, root_dir=REPO_ROOT)):
            where = Path(hit).as_posix()
            path = REPO_ROOT / where
            if not path.is_file() or where in named:
                continue
            size = path.stat().st_size
            if size > spec["limit"]:
                violations.append(
                    Violation(
                        "budget",
                        where,
                        f"{size} B exceeds limit {spec['limit']} B for {spec['pattern']}",
                    )
                )

    for name, spec in budget.get("tiers", {}).items():
        total = sum(
            (REPO_ROOT / where).stat().st_size
            for where in spec["files"]
            if (REPO_ROOT / where).is_file()
        )
        allowed = tier_ceiling(spec, budget.get("files", {}))
        if total > allowed:
            violations.append(
                Violation(
                    "budget",
                    f"tier:{name}",
                    f"{total} B exceeds ceiling {allowed} B (+{total - allowed} B)",
                )
            )

    return violations


def budget_notices(budget: dict) -> list[str]:
    """Per-file targets that are over, worst first. Advisory by design (DEC-062).

    A target is where a file should land, not where it may stop: the tier is what a
    session pays, and the two are not the same question.
    """
    over: list[tuple[int, str, int, int]] = []
    for where, spec in budget.get("files", {}).items():
        path = REPO_ROOT / where
        if not path.is_file():
            continue
        size = path.stat().st_size
        allowed = ceiling(spec)
        if size > allowed:
            over.append((size - allowed, where, size, allowed))
    over.sort(reverse=True)
    return [
        f"  [target] {where}: {size} B, target {allowed} B (+{delta} B)"
        f" — shrink or move at the next maintain round; not a failure"
        for delta, where, size, allowed in over
    ]


# -------------------------------------------------------------------------- index

DECISIONS_FILE = ".agent/decisions.md"
DECISIONS_INDEX_FILE = ".agent/decisions-index.md"
DEC_HEADING_RE = re.compile(r"^## (\d{4}-\d{2}-\d{2})\s*[—\-]\s*(.+?)\s*$")
INDEX_ROW_RE = re.compile(r"^\|\s*(DEC-\d{3})\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|")
INDEX_RETIRED_RE = re.compile(r"^Retired (\d+) — (.+?) —", re.MULTILINE)
DEC_ID_RE = re.compile(r"\bDEC-(\d{3})\b")


def decision_headings() -> list[tuple[str, str]]:
    path = REPO_ROOT / DECISIONS_FILE
    if not path.is_file():
        return []
    found: list[tuple[str, str]] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = DEC_HEADING_RE.match(line)
        if match:
            found.append((match.group(1), match.group(2)))
    return found


def check_index() -> list[Violation]:
    """The index is the navigation into decisions.md, so drift is fatal.

    Since DEC-062 the index lists the decisions that still govern the code, not every
    entry ever made: a retired entry loses its row and is named on the index's
    `Retired N — …` line instead. That line is what keeps the shrink honest — every
    entry in decisions.md is either a row or named there, so dropping a row without
    naming it, or naming one that is still active, still fails.
    """
    index_path = REPO_ROOT / DECISIONS_INDEX_FILE
    if not index_path.is_file():
        return [Violation("index", DECISIONS_INDEX_FILE, "index file is missing")]
    text = index_path.read_text(encoding="utf-8", errors="replace")

    rows = [
        (match.group(1), match.group(2), match.group(3))
        for match in (INDEX_ROW_RE.match(line) for line in text.splitlines())
        if match
    ]
    headings = decision_headings()
    if not headings:
        return [Violation("index", DECISIONS_FILE, "no decision entry found")]
    if not rows:
        return [Violation("index", DECISIONS_INDEX_FILE, "index lists no decision")]

    violations: list[Violation] = []
    listed: set[int] = set()
    highest = 0
    for dec_id, date, title in rows:
        number = int(dec_id[4:])
        if number in listed:
            violations.append(
                Violation("index", f"{DECISIONS_INDEX_FILE}#{dec_id}", "row appears twice")
            )
        elif number <= highest:
            violations.append(
                Violation(
                    "index",
                    f"{DECISIONS_INDEX_FILE}#{dec_id}",
                    "rows must ascend by ID — IDs are issued in decisions.md order",
                )
            )
        listed.add(number)
        highest = max(highest, number)
        if not 1 <= number <= len(headings):
            violations.append(
                Violation(
                    "index",
                    f"{DECISIONS_INDEX_FILE}#{dec_id}",
                    f"no entry {number} in {DECISIONS_FILE} ({len(headings)} entries)",
                )
            )
            continue
        heading = headings[number - 1]
        if (date, title) != heading:
            violations.append(
                Violation(
                    "index",
                    f"{DECISIONS_INDEX_FILE}#{dec_id}",
                    f"row says '{date} — {title}', {DECISIONS_FILE} says '{heading[0]} — {heading[1]}'",
                )
            )

    retired = INDEX_RETIRED_RE.search(text)
    if not retired:
        violations.append(
            Violation(
                "index",
                DECISIONS_INDEX_FILE,
                "missing the `Retired N — DEC-xxx, … —` line that reconciles rows with "
                f"{DECISIONS_FILE}; every entry must be a row or named there",
            )
        )
        return violations
    declared = int(retired.group(1))
    named = sorted({int(match.group(1)) for match in DEC_ID_RE.finditer(retired.group(2))})
    expected = sorted(set(range(1, len(headings) + 1)) - listed)
    if declared != len(expected) or named != expected:
        want = ", ".join(f"DEC-{n:03d}" for n in expected) or "none"
        got = ", ".join(f"DEC-{n:03d}" for n in named) or "none"
        violations.append(
            Violation(
                "index",
                DECISIONS_INDEX_FILE,
                f"Retired line says {declared} ({got}); {DECISIONS_FILE} has {len(headings)} "
                f"entries against {len(rows)} rows, so it should say {len(expected)} ({want})",
            )
        )
    return violations


# -------------------------------------------------------------------------- paths

INVARIANTS_FILE = SCRIPT_DIR / "invariants.json"


def check_paths() -> list[Violation]:
    """Repo-convention invariants that reduce to a path check."""
    config = load_json(INVARIANTS_FILE)
    violations: list[Violation] = []

    for rule in config.get("forbidden", []):
        if (REPO_ROOT / rule["path"]).exists():
            violations.append(
                Violation("paths", rule["path"], f"must not exist ({rule['invariant']}): {rule['why']}")
            )

    for rule in config.get("required", []):
        if not (REPO_ROOT / rule["path"]).exists():
            violations.append(
                Violation("paths", rule["path"], f"is missing ({rule['invariant']}): {rule['why']}")
            )

    return violations


# ------------------------------------------------------------------------- layout

LAYOUT_FILE = SCRIPT_DIR / "layout.json"
# The layer a top-level entry is assigned to. The doctrine behind the table is
# wiki/guides/repository-layout.md; this is only the vocabulary, so a typo fails.
LAYOUT_LAYERS = frozenset(
    {"hot", "settled", "input", "material", "code", "tooling", "runtime", "entry", "deploy"}
)


def tracked_top_level() -> set[str] | None:
    """The top-level entries git tracks: depth-1 files, plus a deeper path's first component.

    `-z` keeps git from quoting non-ASCII paths (core.quotepath), which would otherwise
    report `docs/…` as an entry named `"docs`. `None` means the list could not be read --
    falling back to the working tree would flag every ignored directory as unregistered.
    """
    try:
        out = subprocess.run(
            ["git", "ls-files", "-z"], cwd=REPO_ROOT, capture_output=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    return {
        entry.split("/", 1)[0]
        for entry in out.decode("utf-8", "replace").split("\0")
        if entry
    }


def check_layout() -> list[Violation]:
    """Every tracked top-level entry is registered, and every registration still exists.

    Top level only, by design: what a nested directory may hold is the owning layer's
    business, and the table is the one place saying which layer owns what
    (wiki/guides/repository-layout.md).
    """
    entries = load_json(LAYOUT_FILE).get("entries", {})
    tracked = tracked_top_level()
    if tracked is None:
        return [
            Violation(
                "layout",
                "git",
                "cannot read `git ls-files`; the tracked-file list is what this check compares "
                "against, so it cannot tell registered from unregistered",
            )
        ]
    violations: list[Violation] = []

    for name in tracked - set(entries):
        violations.append(
            Violation(
                "layout",
                name,
                "tracked top-level entry is not registered; add it to "
                "scripts/check-knowledge/layout.json with the layer that owns it "
                "(wiki/guides/repository-layout.md)",
            )
        )
    for name in set(entries) - tracked:
        violations.append(
            Violation(
                "layout",
                name,
                "registered in layout.json but nothing is tracked there; the entry is stale "
                "or the path must be restored",
            )
        )
    for name, spec in entries.items():
        if not isinstance(spec, dict):
            violations.append(Violation("layout", name, "entry must be an object with kind/layer/purpose"))
            continue
        if spec.get("layer") not in LAYOUT_LAYERS:
            violations.append(
                Violation(
                    "layout",
                    name,
                    f"unknown layer '{spec.get('layer')}' (want one of {'/'.join(sorted(LAYOUT_LAYERS))})",
                )
            )
        purpose = spec.get("purpose")
        if not isinstance(purpose, str) or not purpose.strip():
            violations.append(Violation("layout", name, "purpose must be a non-empty string"))

    return sorted(violations, key=lambda violation: (violation.location, violation.message))


# ---------------------------------------------------------------------- captures

CAPTURES_FILE = SCRIPT_DIR / "captures.json"
CAPTURES_COMMENT = (
    "Per-capture seal: the date a capture was frozen, and a sha256 over its content with "
    "the cut markers and all whitespace removed. Written only by --capture-seal, which "
    "refuses to re-seal content that changed. The doctrine is inbox/README.md."
)
CAPTURE_ID_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-\d{2}$")
MARKER_RE = re.compile(r"<!--#(S\d{2,})-->")
CAPTURE_REF_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2}-\d{2})#(S\d{2,})\b")
TRIAGE_ID_RE = re.compile(r"^S\d+$")
CAPTURE_STATUS = {"open", "closed"}
# What may happen to one segment of a capture. The vocabulary is closed so a dropped idea
# has nowhere to hide: every segment is either placed, or explicitly parked.
DISPOSITIONS = {
    "decide": "needs a decision before anything can be built",
    "clarify": "cannot be placed until the user answers something",
    "execute": "small and unambiguous; folds straight into a plan",
    "defer": "acknowledged, not now; carries no destination",
    "reject": "deliberately not doing; carries no destination",
    "dup": "another segment already carries it; the destination names it as #Sxx",
    "noise": "filler with no content; carries no destination",
}
OPEN_DISPOSITIONS = {"decide", "clarify", "execute"}


def capture_body(text: str) -> str:
    """Everything after the frontmatter block."""
    match = FM_RE.match(text)
    return text[match.end():] if match else text


def content_digest(body: str) -> str:
    """sha256 over the content, insensitive to formatting.

    Cut markers and all whitespace go first, and that is the rule rather than a
    shortcut: the format may change, the content may not (DEC-064). Re-wrapping a
    paragraph, re-indenting it or moving a cut marker leaves the digest alone; changing
    one character does not. It also means pre-commit's trailing-whitespace and
    end-of-file fixers cannot break a seal.
    """
    flat = "".join(MARKER_RE.sub("", body).split())
    return "sha256:" + hashlib.sha256(flat.encode("utf-8")).hexdigest()


def capture_dirs() -> dict[str, Path]:
    """capture id -> directory, for `inbox/<YYYY-MM-DD-NN>-<slug>/`."""
    found: dict[str, Path] = {}
    root = REPO_ROOT / INBOX_PREFIX.rstrip("/")
    if not root.is_dir():
        return found
    for path in sorted(root.iterdir()):
        name = path.name
        if path.is_dir() and CAPTURE_ID_RE.match(name[:13]) and name[13:14] == "-":
            found[name[:13]] = path
    return found


def triage_rows(path: Path) -> list[list[str]]:
    """The `| Sxx | summary | disposition | destination |` rows of a triage table."""
    rows: list[list[str]] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if len(cells) == 4 and TRIAGE_ID_RE.match(cells[0]):
            rows.append(cells)
    return rows


def check_captures(files: list[Path]) -> list[Violation]:
    """The intake pipeline: the words stay as dictated, and no segment goes missing.

    Three properties, all mechanical. The content is frozen -- a digest over raw.md with
    formatting removed must match the seal, so the words cannot be quietly rewritten. The
    cut markers must read S01..Sn in order, so the segments tile the body exactly.
    triage.md must carry exactly one row per segment, with a disposition from the closed
    vocabulary, so an idea the user said out loud cannot be dropped without the check
    noticing where it went.
    """
    violations: list[Violation] = []
    sealed: dict = {}
    if CAPTURES_FILE.is_file():
        sealed = load_json(CAPTURES_FILE).get("sealed", {})
    else:
        violations.append(
            Violation(
                "captures",
                rel(CAPTURES_FILE),
                "missing; freeze the first capture with --capture-seal <id>",
            )
        )

    dirs = capture_dirs()
    root = REPO_ROOT / INBOX_PREFIX.rstrip("/")
    known_names = {path.name for path in dirs.values()}
    if root.is_dir():
        for path in sorted(root.iterdir()):
            if path.is_dir() and path.name not in known_names:
                violations.append(
                    Violation(
                        "captures",
                        rel(path),
                        "capture directory must be named <YYYY-MM-DD-NN>-<slug>"
                        " (inbox/README.md)",
                    )
                )

    for name in sorted(set(sealed) - set(dirs)):
        violations.append(
            Violation(
                "captures",
                f"{INBOX_PREFIX}{name}",
                "sealed in captures.json but the directory is gone; restore it rather than "
                "letting a seal outlive what it froze",
            )
        )
    for name in sorted(set(dirs) - set(sealed)):
        violations.append(
            Violation(
                "captures",
                rel(dirs[name]),
                f"not sealed; run --capture-seal {name} once the words are captured",
            )
        )

    segments: dict[str, set[str]] = {}
    for name, path in sorted(dirs.items()):
        raw_path = path / "raw.md"
        triage_path = path / "triage.md"
        for missing in (raw_path, triage_path):
            if not missing.is_file():
                violations.append(
                    Violation(
                        "captures",
                        rel(missing),
                        "missing from the capture (inbox/README.md)",
                    )
                )
        if not raw_path.is_file() or not triage_path.is_file():
            continue

        raw = raw_path.read_text(encoding="utf-8", errors="replace")
        body = capture_body(raw)
        digest = content_digest(body)
        recorded = sealed.get(name, {}).get("digest")
        if recorded and recorded != digest:
            violations.append(
                Violation(
                    "captures",
                    rel(raw_path),
                    "the content changed after it was sealed; only the format may change, "
                    "append a new capture instead of editing this one",
                )
            )

        status = (parse_frontmatter(raw) or {}).get("status", "")
        if status not in CAPTURE_STATUS:
            violations.append(
                Violation(
                    "captures",
                    rel(raw_path),
                    f"frontmatter status '{status or '(missing)'}' is not one of "
                    f"{'/'.join(sorted(CAPTURE_STATUS))}",
                )
            )

        markers = MARKER_RE.findall(body)
        first = MARKER_RE.search(body)
        if first and body[: first.start()].strip():
            violations.append(
                Violation(
                    "captures",
                    rel(raw_path),
                    "text before the first cut marker belongs to no segment; start the body "
                    "with `<!--#S01-->` so the segments tile it",
                )
            )
        expected = [f"S{number:02d}" for number in range(1, len(markers) + 1)]
        if markers != expected:
            found = ", ".join(markers) if markers else "none"
            violations.append(
                Violation(
                    "captures",
                    rel(raw_path),
                    f"cut markers must read S01..S{len(markers):02d} in order, one per segment;"
                    f" found {found}",
                )
            )

        rows = triage_rows(triage_path)
        ids = [row[0] for row in rows]
        segments[name] = set(ids)
        unplaced = [marker for marker in markers if marker not in ids]
        unknown = [segment for segment in ids if segment not in markers]
        if unplaced or unknown:
            detail = []
            if unplaced:
                detail.append(f"no triage row for {', '.join(unplaced)}")
            if unknown:
                detail.append(f"triage row for unknown segment {', '.join(unknown)}")
            violations.append(Violation("captures", rel(triage_path), "; ".join(detail)))
        elif ids != markers:
            violations.append(
                Violation("captures", rel(triage_path), "triage rows are not in segment order")
            )

        for segment, _summary, disposition, destination in rows:
            where = f"{rel(triage_path)}#{segment}"
            if disposition not in DISPOSITIONS:
                violations.append(
                    Violation(
                        "captures",
                        where,
                        f"unknown disposition '{disposition}' (want one of "
                        f"{', '.join(sorted(DISPOSITIONS))})",
                    )
                )
                continue
            if disposition == "dup" and destination.lstrip("#") not in markers:
                violations.append(
                    Violation(
                        "captures",
                        where,
                        f"a duplicate must name the segment that carries it as #Sxx;"
                        f" '{destination}' is not one",
                    )
                )
            if (
                status == "closed"
                and disposition in OPEN_DISPOSITIONS
                and destination.strip("—- ") == ""
            ):
                violations.append(
                    Violation(
                        "captures",
                        where,
                        f"the capture is closed but this segment is still '{disposition}'"
                        " with nowhere to go",
                    )
                )

    for path in files:
        where = rel(path)
        if is_verbatim(where):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for lineno, line in enumerate(mask_fences(text).splitlines(), start=1):
            for capture_id, segment in CAPTURE_REF_RE.findall(line):
                if capture_id not in dirs:
                    violations.append(
                        Violation(
                            "captures",
                            f"{where}:{lineno}",
                            f"{capture_id}#{segment} names no capture in {INBOX_PREFIX}",
                        )
                    )
                elif segment not in segments.get(capture_id, set()):
                    violations.append(
                        Violation(
                            "captures",
                            f"{where}:{lineno}",
                            f"{capture_id}#{segment} names no segment of that capture",
                        )
                    )

    return violations


def seal_capture(capture_id: str) -> int:
    """Record a capture's content digest -- the act that freezes the user's words.

    Re-sealing is idempotent only while the content is unchanged. A different digest means
    raw.md was edited after it was captured, which is exactly what the seal exists to
    catch, so it needs a deliberate second look rather than a quiet rewrite.
    """
    dirs = capture_dirs()
    if capture_id not in dirs:
        print(f"no capture directory for id '{capture_id}' in {INBOX_PREFIX}", file=sys.stderr)
        return 2
    raw = dirs[capture_id] / "raw.md"
    if not raw.is_file():
        print(f"{rel(raw)} is missing", file=sys.stderr)
        return 2
    digest = content_digest(capture_body(raw.read_text(encoding="utf-8", errors="replace")))

    data = load_json(CAPTURES_FILE) if CAPTURES_FILE.is_file() else {}
    sealed = dict(data.get("sealed", {}))
    previous = sealed.get(capture_id, {}).get("digest")
    if previous == digest:
        print(f"{capture_id}: already sealed, content unchanged")
        return 0
    if previous:
        print(
            f"refusing to re-seal {capture_id}: the content changed after sealing\n"
            f"  sealed {previous}\n"
            f"  now    {digest}\n"
            f"  the words are frozen; append a new capture instead of editing this one",
            file=sys.stderr,
        )
        return 2

    sealed[capture_id] = {"date": datetime.date.today().isoformat(), "digest": digest}
    payload = {"_comment": CAPTURES_COMMENT, "sealed": {key: sealed[key] for key in sorted(sealed)}}
    CAPTURES_FILE.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"{capture_id}: sealed {digest}")
    return 0


# -------------------------------------------------------------------------- stale

STAMPS_FILE = SCRIPT_DIR / "knowledge-stamps.json"
REFRESH_HINT = "python scripts/check-knowledge/check_knowledge.py --stamp-refresh"
# The checker's own state. A module may legitimately glob this directory, and hashing the
# stamp file into the digest that file stores would make the digest stale as it is written.
SELF_STATE_FILES = (
    "scripts/check-knowledge/knowledge-stamps.json",
    "scripts/check-knowledge/knowledge-baseline.json",
    "scripts/check-knowledge/knowledge-budget.json",
)
NOTICE_LIMIT = 8


def documented_modules(files: list[Path]) -> dict[str, list[str]]:
    """module -> the wiki/ documents declaring it, in path order."""
    claimants: dict[str, list[str]] = {}
    for path in files:
        where = rel(path)
        if not where.startswith("wiki/") or where.endswith("INDEX.md"):
            continue
        fields = parse_frontmatter(path.read_text(encoding="utf-8", errors="replace"))
        if fields is None:
            continue
        for module in parse_list(fields.get("related_code", "")):
            claimants.setdefault(module, []).append(where)
    return claimants


def module_digest(modules: dict, module: str) -> str:
    """sha256 over a module's files: path, then content, newline-normalised.

    Normalising CRLF is what makes this portable -- `.gitattributes` pins eol=lf today,
    and one config change should not turn every watched module into a false alarm.

    Untracked-but-not-ignored files count, so adding a file to a documented area is
    visible before it is committed rather than after.
    """
    paths: dict[str, Path] = {}
    for pattern in modules.get(module, {}).get("globs", []):
        for path in repo_paths(pattern, untracked=True):
            paths.setdefault(rel(path), path)

    digest = hashlib.sha256()
    for where, path in sorted(paths.items()):
        if where in SELF_STATE_FILES:
            continue
        # git ls-files still lists a file deleted from the working tree but not staged,
        # and reading it would raise; an unstaged delete is not a knowledge-layer fault.
        if not path.is_file():
            continue
        digest.update(where.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes().replace(b"\r\n", b"\n"))
        digest.update(b"\0")
    return "sha256:" + digest.hexdigest()


def check_stale() -> tuple[list[Violation], list[str]]:
    """Remind that a wiki/ document may no longer describe the code.

    Returns (faults, notices). Faults are defects in the stamps file -- an unknown
    module, or a documented module no stamp covers -- and they fail the run, because a
    reminder with a silent hole in it is worse than no reminder. Notices are the
    reminder itself, and stay advisory unless `--strict` asks otherwise.
    """
    if not STAMPS_FILE.is_file():
        return [Violation("stale", rel(STAMPS_FILE), f"missing; create it with {REFRESH_HINT}")], []

    modules = load_json(MODULES_FILE)["modules"]
    docs = documented_modules(md_files())
    watched: dict = load_json(STAMPS_FILE).get("watched", {})

    faults: list[Violation] = [
        Violation(
            "stale",
            f"{rel(STAMPS_FILE)}#{module}",
            "watched module is not in modules.json; drop the entry with --stamp-refresh",
        )
        for module in sorted(set(watched) - set(modules))
    ]
    unwatched = sorted(set(docs) - set(watched))
    if unwatched:
        faults.append(
            Violation(
                "stale",
                rel(STAMPS_FILE),
                f"{len(unwatched)} documented module(s) not watched: {', '.join(unwatched)}"
                f" -- run {REFRESH_HINT}",
            )
        )

    notices: list[str] = []
    for module in sorted(set(watched) & set(modules)):
        if watched[module].get("digest") == module_digest(modules, module):
            continue
        verified = watched[module].get("verified", "an unknown date")
        described_in = ", ".join(docs.get(module, [])) or "no wiki/ document"
        notices.append(
            f"  [watch] {module}: code changed since its documents were verified on {verified}\n"
            f"          {described_in}\n"
            f"          run /knowledge-verify, then: {REFRESH_HINT} --module {module}"
        )
    return faults, notices


def refresh_stamps(only: list[str]) -> int:
    """Record the current digest as verified -- the acknowledgement half of the reminder.

    Refresh a module only after reading the documents it points at: a stamp is a claim
    that they still describe the code, not a way to clear the reminder.
    """
    modules = load_json(MODULES_FILE)["modules"]
    docs = documented_modules(md_files())

    if only:
        unknown = sorted(set(only) - set(modules))
        if unknown:
            print(f"unknown module(s): {', '.join(unknown)}", file=sys.stderr)
            return 2
        targets = sorted(set(only))
    else:
        # A full refresh is also the prune: coverage is what the documents declare.
        targets = sorted(module for module in docs if module in modules)

    stamps = load_json(STAMPS_FILE) if STAMPS_FILE.is_file() else {}
    watched = dict(stamps.get("watched", {})) if only else {}
    today = datetime.date.today().isoformat()
    for module in targets:
        watched[module] = {"verified": today, "digest": module_digest(modules, module)}

    stamps["watched"] = {module: watched[module] for module in sorted(watched)}
    stamps.setdefault("_comment", (
        "Per-module record of the last /knowledge-verify: `verified` is the date, `digest` the "
        "sha256 of the module's code as the documents describe it. Rewritten only by "
        "--stamp-refresh; a mismatch is a reminder, not a failure."
    ))
    STAMPS_FILE.write_text(
        json.dumps(stamps, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"stamps refreshed: {len(targets)} module(s) verified {today}")
    return 0


# -------------------------------------------------------------------------- main

CHECKS = ("refs", "frontmatter", "ownership", "index", "paths", "budget", "layout", "captures")
ADVISORY = ("stale",)
SELECTABLE = CHECKS + ADVISORY


def run_checks(selected: list[str]) -> list[Violation]:
    files = md_files()
    modules = load_json(MODULES_FILE)["modules"]
    violations: list[Violation] = []
    if "refs" in selected:
        violations += check_refs(files)
    if "frontmatter" in selected:
        violations += check_frontmatter(files, modules)
    if "ownership" in selected:
        violations += check_ownership(files)
    if "index" in selected:
        violations += check_index()
    if "paths" in selected:
        violations += check_paths()
    if "budget" in selected:
        violations += check_budget(load_json(BUDGET_FILE))
    if "layout" in selected:
        violations += check_layout()
    if "captures" in selected:
        violations += check_captures(files)
    return violations


def budget_report() -> None:
    """Print usage against every ceiling, worst first. The DEC-054 traffic-light monitor.

    `[SB]` marks must-read membership: S = tier:session_start, B = tier:before_code_change
    (their union, session_total, is the hot layer DEC-055 prices per byte per session).

    The first column says which rows are gates: `GATE` for a tier and for a glob, `target`
    for a per-file entry. Only a gate can fail a commit (DEC-062); a target is where the
    file should land, and the traffic light is the prompt to get it there, not a verdict.
    """
    budget = load_json(BUDGET_FILE)
    files = budget.get("files", {})
    rows: list[tuple[str, int, int, str, str]] = []

    tier_marks: dict[str, str] = {}
    for name, spec in budget.get("tiers", {}).items():
        if name == "session_total":
            continue  # the union of the other two — its mark would collide and add nothing
        mark = name[0].upper()
        for where in spec["files"]:
            if mark not in tier_marks.setdefault(where, ""):
                tier_marks[where] += mark

    for where, spec in files.items():
        path = REPO_ROOT / where
        if path.is_file():
            rows.append(
                (where, path.stat().st_size, ceiling(spec), tier_marks.get(where, ""), "target")
            )

    for spec in budget.get("globs", []):
        for hit in sorted(globlib.glob(spec["pattern"], recursive=True, root_dir=REPO_ROOT)):
            where = Path(hit).as_posix()
            path = REPO_ROOT / where
            if path.is_file() and where not in files:
                rows.append(
                    (where, path.stat().st_size, spec["limit"], tier_marks.get(where, ""), "GATE")
                )

    for name, spec in budget.get("tiers", {}).items():
        total = sum(
            (REPO_ROOT / where).stat().st_size
            for where in spec["files"]
            if (REPO_ROOT / where).is_file()
        )
        rows.append((f"tier:{name}", total, tier_ceiling(spec, files), "", "GATE"))

    rows.sort(key=lambda row: row[1] / row[2], reverse=True)
    for where, size, allowed, marks, kind in rows:
        share = size / allowed
        zone = "RED" if share > 0.95 else "YELLOW" if share > 0.85 else "green"
        print(
            f"{kind:6s} {zone:6s} {share:6.1%}  {size:6d} / {allowed:6d} B  "
            f"{where}{f' [{marks}]' if marks else ''}"
        )


def refresh_budget() -> None:
    """Raise the tier ceilings to the current size. Deliberate growth only.

    Tiers alone. A per-file `limit` is a target, and a target that tracks the file's
    current size is not a target (DEC-062): rewriting it here *was* the ratchet — every
    archive round pulled decisions.md's ceiling down after it (44032 → 24576 B in six
    days), and a ceiling that only ever falls turns "write less precisely" into the cheap
    move. The two glob limits are hand-set policy ("this page should split"), so they stay.

    A tier's limit is the sum of its members' measured sizes, which lets the tier inherit
    their slack instead of landing at zero headroom; `slack` itself is never folded into
    the limit, or `limit + slack` (see `ceiling`) would grant it twice.
    """
    budget = load_json(BUDGET_FILE)
    for spec in budget.get("tiers", {}).values():
        spec["limit"] = sum(
            (REPO_ROOT / where).stat().st_size
            for where in spec["files"]
            if (REPO_ROOT / where).is_file()
        )
    BUDGET_FILE.write_text(json.dumps(budget, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"budget tiers refreshed from {BUDGET_FILE.name}")
    print("per-file targets and glob limits left alone — a target is not a gate (DEC-062)")


def update_baseline() -> None:
    """Record the violations that exist now as accepted debt."""
    baseline = {check: sorted({v.fingerprint for v in run_checks([check])}) for check in CHECKS}
    BASELINE_FILE.write_text(
        json.dumps(baseline, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    total = sum(len(entries) for entries in baseline.values())
    print(f"baseline updated: {total} accepted violation(s) recorded")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("checks", nargs="*", choices=SELECTABLE, default=None,
                        help="run only these checks (default: all)")
    parser.add_argument("--baseline-update", action="store_true",
                        help="accept the current violations as the baseline")
    parser.add_argument("--budget-report", action="store_true",
                        help="print usage against every ceiling, worst first (no checks run)")
    parser.add_argument("--budget-refresh", action="store_true",
                        help="raise the tier ceilings to the current size (per-file targets stay put)")
    parser.add_argument("--stamp-refresh", action="store_true",
                        help="record the current code as verified for the watched modules")
    parser.add_argument("--capture-seal", metavar="CAPTURE_ID",
                        help="freeze a capture's content digest, refusing to re-seal a change")
    parser.add_argument("--module", action="append", default=[],
                        help="with --stamp-refresh: refresh only this module (repeatable)")
    parser.add_argument("--strict", action="store_true",
                        help="treat `stale` reminders and per-file target notices as violations")
    args = parser.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    if args.budget_report:
        budget_report()
        return 0
    if args.module and not args.stamp_refresh:
        parser.error("--module is only meaningful together with --stamp-refresh")
    if args.budget_refresh:
        refresh_budget()
        return 0
    if args.stamp_refresh:
        return refresh_stamps(args.module)
    if args.capture_seal:
        return seal_capture(args.capture_seal)
    if args.baseline_update:
        update_baseline()
        return 0

    selected = args.checks or list(SELECTABLE)
    baseline = load_json(BASELINE_FILE) if BASELINE_FILE.is_file() else {}
    accepted = {check: set(baseline.get(check, [])) for check in CHECKS}

    violations = run_checks([check for check in selected if check in CHECKS])
    notices: list[str] = []
    if "stale" in selected:
        stale_faults, notices = check_stale()
        violations += stale_faults
    targets: list[str] = []
    if "budget" in selected:
        targets = budget_notices(load_json(BUDGET_FILE))
    # `stale` and the per-file budget targets have no baseline: a fault means the reminder
    # stopped covering something, which is the one failure this check exists to prevent.
    new = [v for v in violations if v.fingerprint not in accepted.get(v.check, set())]
    grandfathered = len(violations) - len(new)

    for check in selected:
        check_new = [v for v in new if v.check == check]
        check_old = len([v for v in violations if v.check == check]) - len(check_new)
        if not check_new and not check_old:
            print(f"[watch] {check}" if notices and check in ADVISORY else f"[ok]   {check}")
            continue
        status = "FAIL" if check_new else "ok  "
        suffix = f" (+{check_old} grandfathered)" if check_old else ""
        print(f"[{status}] {check}{suffix}")
        for violation in check_new:
            print(violation)

    if grandfathered:
        print(f"\n{grandfathered} grandfathered violation(s) in knowledge-baseline.json")

    if targets:
        print()
        for notice in targets[:NOTICE_LIMIT]:
            print(notice)
        if len(targets) > NOTICE_LIMIT:
            print(f"  ... and {len(targets) - NOTICE_LIMIT} more file(s)")
        verdict = (
            "Failing, because --strict is set."
            if args.strict
            else "Targets, not gates: this does not fail a commit."
        )
        print(f"\n{len(targets)} file(s) over their target. {verdict}")

    if notices:
        print()
        for notice in notices[:NOTICE_LIMIT]:
            print(notice)
        if len(notices) > NOTICE_LIMIT:
            print(f"  ... and {len(notices) - NOTICE_LIMIT} more module(s)")
        verdict = "Failing, because --strict is set." if args.strict else "Advisory only."
        print(f"\n{len(notices)} watched module(s) changed after they were verified. {verdict}")

    if new:
        print(f"\n{len(new)} new violation(s). Fix them, or record debt deliberately with --baseline-update.")
        return 1
    if args.strict and (notices or targets):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Integrity checks for the repository knowledge layer.

Seven violation checks, one advisory check and an on-demand size report, all
deterministic (no LLM, no network):

  refs         Markdown links resolve; every ADR-00xx reference has a file.
  frontmatter  knowledge/wiki/ documents carry a valid schema, and every `related_code`
               module exists and still matches at least one real file.
  ownership    Git commit hashes stay in the places allowed to narrate history.
  index        Both tables of contents. decisions-index.md carries one row per entry in
               decisions.md, in ID order and agreeing on date and title -- or names the
               entry on its `Retired N — …` line. INDEX.md lists every markdown file in
               the cold store exactly once, so nothing there is reachable only by guessing.
  paths        Repo-convention invariants that reduce to a path check, plus the
               knowledge paths in paths.json: an entry marked required that is not
               on disk fails here, instead of leaving a gate matching nothing.
  layout       Every top-level entry git tracks is registered in layout.json with
               the layer that owns it, and every registered entry still has
               something tracked there. The doctrine is knowledge/wiki/guides/repository-layout.md.
  captures     The user's dictated words stay exactly as captured, and every segment of
               them carries a disposition. The doctrine is knowledge/inbox/README.md.
  stale        (advisory) Code changed under a module some knowledge/wiki/ document describes,
               since that document was last verified.

Every location above is resolved from scripts/check-knowledge/paths.json rather than from a
string literal, which is what makes a move of the layer loud instead of silent: read that
file before moving a knowledge directory.

Usage:
    python scripts/check-knowledge/check_knowledge.py            # all checks
    python scripts/check-knowledge/check_knowledge.py refs       # one check
    python scripts/check-knowledge/check_knowledge.py stale      # the reminder alone
    python scripts/check-knowledge/check_knowledge.py --size-report
    python scripts/check-knowledge/check_knowledge.py --baseline-update
    python scripts/check-knowledge/check_knowledge.py --stamp-refresh --module auth
    python scripts/check-knowledge/check_knowledge.py --capture-seal 2026-09-29-01

Exit code is 0 when clean, 1 when a violation is not already recorded in
knowledge-baseline.json. Baselines are for debt that is scheduled to be paid
off, not for silencing a check -- see README.md.

`stale` notices are advisory: they print but do not fail the run unless `--strict` asks them
to -- nobody verifies prose on command. Faults in `knowledge-stamps.json` itself do fail, so
the reminder cannot quietly stop covering a module. Sizes are reported (`--size-report`) and
never judged: the layer carries no byte ceiling and no byte target (DEC-067), because a wall
at the moment of writing buys shorter sentences, not fewer facts.
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
PATHS_FILE = SCRIPT_DIR / "paths.json"
BASELINE_FILE = SCRIPT_DIR / "knowledge-baseline.json"


def rel(path: Path) -> str:
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


# ------------------------------------------------------------------ paths config

# Every location this checker scans, skips or reports is resolved from paths.json, and the
# constants below are only the shape the code wants them in. The indirection is the point:
# a gate keyed off a literal prefix keeps matching nothing after a directory moves and
# prints [ok] on the empty set, while a gate keyed off a missing config entry fails loudly.
PATH_CONFIG = load_json(PATHS_FILE)
PATHS = PATH_CONFIG["paths"]
FILENAMES = PATH_CONFIG["filenames"]


def _cfg(key: str) -> str:
    """One configured path, relative to the repository root."""
    try:
        return PATHS[key]["path"]
    except KeyError:
        raise SystemExit(
            f"{rel(PATHS_FILE)}: no path entry '{key}'. The checker reads this file by key; "
            f"restore the key, or point the checker at whatever replaced it."
        ) from None


def _prefix(key: str) -> str:
    """A configured path as a `startswith()` prefix.

    The trailing slash comes from `kind`, never from the value as written: the config says
    what the path is, not the shape a gate wants it in, so one entry spells a directory the
    same way for the existence check and for the prefix match that scans it.
    """
    return _cfg(key) + "/" if PATHS[key]["kind"] == "dir" else _cfg(key)


def _filename(key: str) -> str:
    """One configured bare filename: a name inside a directory, not a repository path."""
    try:
        return FILENAMES[key]
    except KeyError:
        raise SystemExit(f"{rel(PATHS_FILE)}: no filename entry '{key}'") from None


for _key, _spec in PATHS.items():
    # A typo'd kind would silently drop the slash and leave the prefix matching nothing.
    if _spec.get("kind") not in ("dir", "file"):
        raise SystemExit(
            f"{rel(PATHS_FILE)}: '{_key}' declares kind '{_spec.get('kind')}'; want dir or file"
        )

# History-narrating locations that are allowed to carry commit hashes.
HASH_ALLOWED_PREFIXES = tuple(_prefix(key) for key in PATH_CONFIG["hash_allowed_prefixes"])
WIKI_PREFIX = _prefix("wiki")
# The hot layer and the cold store are both held to the commit-hash rule; what that rule
# allows (history that narrates itself) is `hash_allowed_prefixes`.
OWNERSHIP_PREFIXES = tuple(_prefix(key) for key in PATH_CONFIG["ownership_prefixes"])
ADR_DIR = _cfg("adr")
INDEX_FILE = _cfg("index")
INDEX_FILENAME = Path(INDEX_FILE).name
DECISIONS_FILE = _cfg("decisions")
DECISIONS_INDEX_FILE = _cfg("decisions_index")
CHANGELOG_FILE = _cfg("changelog")

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
FROZEN_PREFIXES = tuple(_prefix(key) for key in PATH_CONFIG["frozen_prefixes"])
REQUIRED_FM_KEYS = (
    "title", "tags", "status", "confidence", "related_code", "related", "created", "updated",
)
# Documents that describe code must declare which modules they describe;
# guides describe process and may legitimately declare none.
MODULES_REQUIRED_PREFIXES = tuple(_prefix(key) for key in PATH_CONFIG["modules_required_prefixes"])

# `knowledge/inbox/` holds the user's own dictated words, captured verbatim (knowledge/inbox/README.md). A raw
# capture is frozen by a content digest, so a prose check it cannot satisfy is a check
# nobody may fix -- those words are not ours to edit.
INBOX_DIR = _cfg("inbox")
INBOX_PREFIX = _prefix("inbox")
CAPTURE_RAW = _filename("capture_raw")
CAPTURE_TRIAGE = _filename("capture_triage")
VERBATIM_SUFFIX = "/" + CAPTURE_RAW


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
            # git prints UTF-8; decoding it as the console's locale codec (GBK on a
            # Chinese Windows) raises on any non-ASCII path and takes the whole run
            # down. Decode explicitly and never raise on a stray byte.
            out = subprocess.run(
                command, cwd=REPO_ROOT, capture_output=True, text=True, check=True,
                encoding="utf-8", errors="replace",
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
        p.name[:4] for p in (REPO_ROOT / ADR_DIR).glob("*.md") if p.name[:4].isdigit()
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
                        Violation(
                            "refs",
                            f"{where}:{lineno}",
                            f"ADR-{number} has no file in {ADR_DIR}/",
                        )
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
        if not where.startswith(WIKI_PREFIX) or where.endswith(INDEX_FILENAME):
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
        if not where.startswith(OWNERSHIP_PREFIXES):
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
                        f"commit hash '{token}' — history belongs in {DECISIONS_FILE} "
                        f"or {CHANGELOG_FILE}",
                    )
                )

    return violations


# -------------------------------------------------------------------------- index

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
    """The cold store's two tables of contents, each held to what it describes.

    decisions-index.md mirrors decisions.md entry for entry; INDEX.md lists every
    markdown file in the cold store exactly once. One check, because they fail the same
    way: a table of contents that stopped describing what it points at, which is how a
    settled layer quietly becomes a place things are forgotten in.
    """
    return check_decision_index() + check_index_listing()


def check_decision_index() -> list[Violation]:
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


def check_index_listing() -> list[Violation]:
    """Every markdown file in the cold store is listed in INDEX.md exactly once.

    This is the half that keeps a cold store from becoming a place things are forgotten
    in: a file nobody indexes is a file nobody opens, and a file listed twice is two rows
    that drift apart. The other direction -- a listed path with no file behind it -- is
    the `refs` check's job, and it runs in the same process and the same pre-commit hook,
    so a dead row is reported once there rather than twice here.

    Files under the archive prefix are exempt on purpose: frozen history is an
    archaeology site, not an index entry, and INDEX.md says so in prose.
    """
    index_path = REPO_ROOT / INDEX_FILE
    if not index_path.is_file():
        return [Violation("index", INDEX_FILE, "the cold store's index file is missing")]

    # The census is taken the same way everywhere else in this file -- tracked plus
    # not-yet-staged .md files -- so a new document is expected in the index before it
    # is committed, not after.
    root = _cfg("knowledge_root")
    root_prefix = _prefix("knowledge_root")
    archive_prefix = _prefix("archive")
    text = index_path.read_text(encoding="utf-8", errors="replace")
    listed: dict[str, int] = {}
    for target in LINK_RE.findall(mask_code(text)):
        if target.startswith(("http://", "https://", "mailto:", "tel:", "#")):
            continue
        clean = target.split("#", 1)[0]
        if not clean or not looks_like_path(clean):
            continue
        # Index links are relative to the cold store root, so that is what they resolve
        # against; the key is the repo-relative path, the shape every check registers.
        where = rel((REPO_ROOT / root / clean).resolve())
        listed[where] = listed.get(where, 0) + 1

    violations: list[Violation] = []
    for where in sorted(listed):
        if listed[where] > 1:
            violations.append(
                Violation(
                    "index",
                    INDEX_FILE,
                    f"{where} is listed {listed[where]} times; one row per file, or the "
                    "rows drift apart",
                )
            )

    for path in sorted(repo_paths("*.md", untracked=True)):
        # git ls-files still lists a file deleted from the working tree but not staged,
        # and an unstaged delete is not a missing row.
        if not path.is_file():
            continue
        where = rel(path)
        if not where.startswith(root_prefix) or where.startswith(archive_prefix):
            continue
        if where == INDEX_FILE or where in listed:
            continue
        violations.append(
            Violation(
                "index",
                INDEX_FILE,
                f"{where} is not listed; a cold-store file outside its table of contents "
                "is one nobody finds",
            )
        )

    return violations


# -------------------------------------------------------------------------- paths

INVARIANTS_FILE = SCRIPT_DIR / "invariants.json"


def check_paths() -> list[Violation]:
    """Repo-convention invariants that reduce to a path check.

    Two sources of rule. `invariants.json` is a rule someone wrote down about this repo.
    `paths.json` is where the knowledge layer says it is -- and checking it is what keeps a
    move loud: without this, renaming a directory leaves every gate keyed off its prefix
    scanning an empty set, which reports [ok] as cheerfully as a healthy tree does.
    """
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

    for key, spec in PATHS.items():
        if not spec.get("required") or (REPO_ROOT / spec["path"]).exists():
            continue
        violations.append(
            Violation(
                "paths",
                f"{rel(PATHS_FILE)}#{key}",
                f"'{spec['path']}' does not exist. A knowledge path moved or was renamed: "
                f"update the '{key}' entry (or drop it if the path is gone for good), so the "
                f"checks that read it fail here instead of matching nothing",
            )
        )

    return violations


# ------------------------------------------------------------------------- layout

LAYOUT_FILE = SCRIPT_DIR / "layout.json"
# The layer a top-level entry is assigned to. The doctrine behind the table is
# knowledge/wiki/guides/repository-layout.md; this is only the vocabulary, so a typo fails.
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
    (knowledge/wiki/guides/repository-layout.md).
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
                "(knowledge/wiki/guides/repository-layout.md)",
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
    f"refuses to re-seal content that changed. The doctrine is {INBOX_PREFIX}README.md."
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
    """capture id -> directory, for `knowledge/inbox/<YYYY-MM-DD-NN>-<slug>/`."""
    found: dict[str, Path] = {}
    root = REPO_ROOT / INBOX_DIR
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
    root = REPO_ROOT / INBOX_DIR
    known_names = {path.name for path in dirs.values()}
    if root.is_dir():
        for path in sorted(root.iterdir()):
            if path.is_dir() and path.name not in known_names:
                violations.append(
                    Violation(
                        "captures",
                        rel(path),
                        "capture directory must be named <YYYY-MM-DD-NN>-<slug>"
                        f" ({INBOX_PREFIX}README.md)",
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
        raw_path = path / CAPTURE_RAW
        triage_path = path / CAPTURE_TRIAGE
        for missing in (raw_path, triage_path):
            if not missing.is_file():
                violations.append(
                    Violation(
                        "captures",
                        rel(missing),
                        f"missing from the capture ({INBOX_PREFIX}README.md)",
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
    raw = dirs[capture_id] / CAPTURE_RAW
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
# The checker's own state, kept in paths.json because a module may legitimately glob that
# directory: hashing the stamp file into the digest that file stores would make the digest
# stale as it is written.
SELF_STATE_FILES = tuple(PATH_CONFIG["self_state_files"])
NOTICE_LIMIT = 8


def documented_modules(files: list[Path]) -> dict[str, list[str]]:
    """module -> the knowledge/wiki/ documents declaring it, in path order."""
    claimants: dict[str, list[str]] = {}
    for path in files:
        where = rel(path)
        if not where.startswith(WIKI_PREFIX) or where.endswith(INDEX_FILENAME):
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
    """Remind that a knowledge/wiki/ document may no longer describe the code.

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
        described_in = ", ".join(docs.get(module, [])) or f"no {WIKI_PREFIX} document"
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

CHECKS = ("refs", "frontmatter", "ownership", "index", "paths", "layout", "captures")
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
    if "layout" in selected:
        violations += check_layout()
    if "captures" in selected:
        violations += check_captures(files)
    return violations


def directory_size(path: Path) -> tuple[int, int]:
    """(bytes, files) under a directory, recursively."""
    size = 0
    files = 0
    for found in path.rglob("*"):
        if found.is_file():
            size += found.stat().st_size
            files += 1
    return size, files


def size_report() -> None:
    """Print what the knowledge layer weighs. Report only: nothing here can fail.

    The layer carries no byte ceiling and no byte target (DEC-067) -- a wall at the moment
    of writing buys shorter sentences, not fewer facts, and a number that never gates
    anything is still worth seeing, because a directory that quietly doubled is how a layer
    stops being read. Hot files are what a session loads before it knows the task; cold
    entries are what it reads on demand.

    Both lists come from paths.json, so the report follows the layout instead of restating
    it, and either can be edited there without touching the checker. A cold entry's `kind`
    decides whether it is totalled as a directory or measured as a single top-level file,
    so the one list can hold both without saying which is which twice.
    """
    report = PATH_CONFIG["size_report"]
    print("knowledge size report: bytes on disk; hot = read every session, cold = on demand")
    hot_size = 0
    hot_files = 0
    for key in report["hot_files"]:
        path = REPO_ROOT / _cfg(key)
        if not path.is_file():
            print(f"  hot   {'missing':>8}  {_cfg(key)}")
            continue
        size = path.stat().st_size
        hot_size += size
        hot_files += 1
        print(f"  hot   {size:>8}  {_cfg(key)}")
    cold_size = 0
    cold_files = 0
    for key in report["cold"]:
        path = REPO_ROOT / _cfg(key)
        if PATHS[key]["kind"] == "dir" and path.is_dir():
            size, files = directory_size(path)
        elif PATHS[key]["kind"] == "file" and path.is_file():
            size, files = path.stat().st_size, 1
        else:
            print(f"  cold  {'missing':>8}  {_cfg(key)}")
            continue
        cold_size += size
        cold_files += files
        print(f"  cold  {size:>8}  {files:>4} files  {_cfg(key)}")
    print(
        f"hot {hot_size} B in {hot_files} files; "
        f"cold {cold_size} B in {cold_files} files; total {hot_size + cold_size} B"
    )


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
    parser.add_argument("--size-report", action="store_true",
                        help="print the layer's size, hot files then cold directories (no checks run)")
    parser.add_argument("--stamp-refresh", action="store_true",
                        help="record the current code as verified for the watched modules")
    parser.add_argument("--capture-seal", metavar="CAPTURE_ID",
                        help="freeze a capture's content digest, refusing to re-seal a change")
    parser.add_argument("--module", action="append", default=[],
                        help="with --stamp-refresh: refresh only this module (repeatable)")
    parser.add_argument("--strict", action="store_true",
                        help="treat `stale` reminders as violations")
    args = parser.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    if args.size_report:
        size_report()
        return 0
    if args.module and not args.stamp_refresh:
        parser.error("--module is only meaningful together with --stamp-refresh")
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
    # `stale` has no baseline: a fault means the reminder stopped covering something,
    # which is the one failure this check exists to prevent.
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
    if args.strict and notices:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

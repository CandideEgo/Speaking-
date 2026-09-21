#!/usr/bin/env python3
"""Integrity checks for the repository knowledge layer.

Six violation checks plus one advisory reminder, all deterministic (no LLM, no network):

  refs         Markdown links resolve; every ADR-00xx reference has a file.
  frontmatter  wiki/ documents carry a valid schema, and every `related_code`
               module exists and still matches at least one real file.
  ownership    Git commit hashes stay in the places allowed to narrate history.
  index        decisions-index.md and decisions.md agree on count, order, date
               and title.
  paths        Repo-convention invariants that reduce to a path check.
  budget       The must-read knowledge set never grows past its recorded size,
               plus the declared `slack` for each file and tier.
  stale        Code changed under a module some wiki/ document describes, since
               that document was last verified.

Usage:
    python scripts/check-knowledge/check_knowledge.py            # all checks
    python scripts/check-knowledge/check_knowledge.py refs       # one check
    python scripts/check-knowledge/check_knowledge.py stale      # the reminder alone
    python scripts/check-knowledge/check_knowledge.py --baseline-update
    python scripts/check-knowledge/check_knowledge.py --stamp-refresh --module auth

Exit code is 0 when clean, 1 when a violation is not already recorded in
knowledge-baseline.json. Baselines are for debt that is scheduled to be paid
off, not for silencing a check -- see README.md.

`stale` is the one advisory check: its notices print but do not fail the run unless
`--strict` asks them to -- nobody verifies prose on command, so a reminder that blocks
commits buys silence instead of accuracy. Faults in `knowledge-stamps.json` itself do
fail, so the reminder cannot quietly stop covering a module.
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


def mask_code(text: str) -> str:
    """Blank out fenced and inline code, preserving offsets and line numbers.

    Regex fragments and paths inside code samples are not links; parsing them as
    links produces false positives.
    """

    def blank(match: re.Match) -> str:
        return re.sub(r"[^\n]", " ", match.group(0))

    return INLINE_CODE_RE.sub(blank, FENCE_RE.sub(blank, text))


def looks_like_path(target: str) -> bool:
    """Skip targets that cannot name a file (regex fragments, prose, placeholders)."""
    return "/" in target or "\\" in target or bool(PATH_EXT_RE.search(target))


def check_refs(files: list[Path]) -> list[Violation]:
    violations: list[Violation] = []
    adr_numbers = {
        p.name[:4] for p in (REPO_ROOT / "docs" / "adr").glob("*.md") if p.name[:4].isdigit()
    }

    for path in files:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        where = rel(path)

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

    `slack` is headroom for content this repo does not author — currently the GitNexus
    block that `npx gitnexus analyze` rewrites in AGENTS.md and CLAUDE.md on every
    reindex. Without it, a reindex trips the budget for a change no one made by hand.
    """
    return spec["limit"] + spec.get("slack", 0)


def tier_ceiling(spec: dict, files: dict) -> int:
    """A tier's ceiling is its own limit plus its members' slack, and nothing more.

    A tier is the sum of its files, so it cannot be granted slack its members do not
    have — otherwise the tier would pass while every file in it was over.
    """
    return spec["limit"] + sum(files.get(where, {}).get("slack", 0) for where in spec["files"])


def check_budget(budget: dict) -> list[Violation]:
    violations: list[Violation] = []
    files = budget.get("files", {})

    for where, spec in files.items():
        path = REPO_ROOT / where
        if not path.is_file():
            continue
        size = path.stat().st_size
        allowed = ceiling(spec)
        if size > allowed:
            violations.append(
                Violation(
                    "budget",
                    where,
                    f"{size} B exceeds ceiling {allowed} B (+{size - allowed} B)",
                )
            )

    named = set(files)
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
        allowed = tier_ceiling(spec, files)
        if total > allowed:
            violations.append(
                Violation(
                    "budget",
                    f"tier:{name}",
                    f"{total} B exceeds ceiling {allowed} B (+{total - allowed} B)",
                )
            )

    return violations


# -------------------------------------------------------------------------- index

DECISIONS_FILE = ".agent/decisions.md"
DECISIONS_INDEX_FILE = ".agent/decisions-index.md"
DEC_HEADING_RE = re.compile(r"^## (\d{4}-\d{2}-\d{2})\s*[—\-]\s*(.+?)\s*$")
INDEX_ROW_RE = re.compile(r"^\|\s*(DEC-\d{3})\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|")


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
    """The decision index is the only navigation into decisions.md, so drift is fatal."""
    index_path = REPO_ROOT / DECISIONS_INDEX_FILE
    if not index_path.is_file():
        return [Violation("index", DECISIONS_INDEX_FILE, "index file is missing")]

    rows = [
        (match.group(1), match.group(2), match.group(3))
        for match in (
            INDEX_ROW_RE.match(line)
            for line in index_path.read_text(encoding="utf-8", errors="replace").splitlines()
        )
        if match
    ]
    headings = decision_headings()

    if len(rows) != len(headings):
        return [
            Violation(
                "index",
                DECISIONS_INDEX_FILE,
                f"{len(rows)} rows for {len(headings)} entries in {DECISIONS_FILE}",
            )
        ]

    violations: list[Violation] = []
    for position, ((dec_id, date, title), heading) in enumerate(zip(rows, headings), start=1):
        expected_id = f"DEC-{position:03d}"
        if dec_id != expected_id:
            violations.append(
                Violation(
                    "index",
                    f"{DECISIONS_INDEX_FILE}#{position}",
                    f"expected {expected_id}, found {dec_id} — IDs are assigned in file order",
                )
            )
        if (date, title) != heading:
            violations.append(
                Violation(
                    "index",
                    f"{DECISIONS_INDEX_FILE}#{dec_id}",
                    f"row says '{date} — {title}', {DECISIONS_FILE} says '{heading[0]} — {heading[1]}'",
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
    for where in sorted(paths):
        if where in SELF_STATE_FILES:
            continue
        digest.update(where.encode("utf-8"))
        digest.update(b"\0")
        digest.update(paths[where].read_bytes().replace(b"\r\n", b"\n"))
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

CHECKS = ("refs", "frontmatter", "ownership", "index", "paths", "budget")
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
    return violations


def refresh_budget() -> None:
    """Raise every ceiling to the current size. Deliberate growth only.

    Writes the *measured* size into `limit` and leaves `slack` alone: the ceiling is
    `limit + slack` (see `ceiling`), so folding slack into the limit would grant it twice.
    A tier's limit is likewise the sum of its members' measured sizes, which lets the tier
    inherit their slack instead of landing at zero headroom.
    """
    budget = load_json(BUDGET_FILE)
    for where, spec in budget.get("files", {}).items():
        path = REPO_ROOT / where
        if path.is_file():
            spec["limit"] = path.stat().st_size
    for spec in budget.get("tiers", {}).values():
        spec["limit"] = sum(
            (REPO_ROOT / where).stat().st_size
            for where in spec["files"]
            if (REPO_ROOT / where).is_file()
        )
    BUDGET_FILE.write_text(json.dumps(budget, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"budget ceilings refreshed from {BUDGET_FILE.name}")


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
    parser.add_argument("--budget-refresh", action="store_true",
                        help="raise every size ceiling to the current size")
    parser.add_argument("--stamp-refresh", action="store_true",
                        help="record the current code as verified for the watched modules")
    parser.add_argument("--module", action="append", default=[],
                        help="with --stamp-refresh: refresh only this module (repeatable)")
    parser.add_argument("--strict", action="store_true",
                        help="treat `stale` reminders as violations")
    args = parser.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    if args.module and not args.stamp_refresh:
        parser.error("--module is only meaningful together with --stamp-refresh")
    if args.budget_refresh:
        refresh_budget()
        return 0
    if args.stamp_refresh:
        return refresh_stamps(args.module)
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

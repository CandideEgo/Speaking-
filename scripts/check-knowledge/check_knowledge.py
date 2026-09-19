#!/usr/bin/env python3
"""Integrity checks for the repository knowledge layer.

Four independent checks, all deterministic (no LLM, no network):

  refs         Markdown links resolve; every ADR-00xx reference has a file.
  frontmatter  wiki/ documents carry a valid schema, and every `related_code`
               module exists and still matches at least one real file.
  ownership    Git commit hashes stay in the places allowed to narrate history.
  budget       The must-read knowledge set never grows past its recorded size.

Usage:
    python scripts/check-knowledge/check_knowledge.py            # all checks
    python scripts/check-knowledge/check_knowledge.py refs       # one check
    python scripts/check-knowledge/check_knowledge.py --baseline-update

Exit code is 0 when clean, 1 when a violation is not already recorded in
knowledge-baseline.json. Baselines are for debt that is scheduled to be paid
off, not for silencing a check -- see README.md.
"""

from __future__ import annotations

import argparse
import glob as globlib
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


def check_budget(budget: dict) -> list[Violation]:
    violations: list[Violation] = []

    for where, spec in budget.get("files", {}).items():
        path = REPO_ROOT / where
        if not path.is_file():
            continue
        size = path.stat().st_size
        if size > spec["limit"]:
            violations.append(
                Violation(
                    "budget",
                    where,
                    f"{size} B exceeds limit {spec['limit']} B (+{size - spec['limit']} B)",
                )
            )

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
        if total > spec["limit"]:
            violations.append(
                Violation(
                    "budget",
                    f"tier:{name}",
                    f"{total} B exceeds limit {spec['limit']} B (+{total - spec['limit']} B)",
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


# -------------------------------------------------------------------------- main

CHECKS = ("refs", "frontmatter", "ownership", "index", "paths", "budget")


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
    """Raise every size ceiling to the current size. Deliberate growth only."""
    budget = load_json(BUDGET_FILE)
    for where, spec in budget.get("files", {}).items():
        path = REPO_ROOT / where
        if path.is_file():
            # Slack absorbs size churn in machine-owned files (the GitNexus block).
            spec["limit"] = path.stat().st_size + spec.get("slack", 0)
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
    parser.add_argument("checks", nargs="*", choices=CHECKS, default=None,
                        help="run only these checks (default: all)")
    parser.add_argument("--baseline-update", action="store_true",
                        help="accept the current violations as the baseline")
    parser.add_argument("--budget-refresh", action="store_true",
                        help="raise every size ceiling to the current size")
    args = parser.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    if args.budget_refresh:
        refresh_budget()
        return 0
    if args.baseline_update:
        update_baseline()
        return 0

    selected = args.checks or list(CHECKS)
    baseline = load_json(BASELINE_FILE) if BASELINE_FILE.is_file() else {}
    accepted = {check: set(baseline.get(check, [])) for check in CHECKS}

    violations = run_checks(selected)
    new = [v for v in violations if v.fingerprint not in accepted[v.check]]
    grandfathered = len(violations) - len(new)

    for check in selected:
        check_new = [v for v in new if v.check == check]
        check_old = len([v for v in violations if v.check == check]) - len(check_new)
        if not check_new and not check_old:
            print(f"[ok]   {check}")
            continue
        status = "FAIL" if check_new else "ok  "
        suffix = f" (+{check_old} grandfathered)" if check_old else ""
        print(f"[{status}] {check}{suffix}")
        for violation in check_new:
            print(violation)

    if grandfathered:
        print(f"\n{grandfathered} grandfathered violation(s) in knowledge-baseline.json")

    if new:
        print(f"\n{len(new)} new violation(s). Fix them, or record debt deliberately with --baseline-update.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

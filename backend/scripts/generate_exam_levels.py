"""Regenerate ``frontend/src/lib/examLevels.generated.ts`` from the Python taxonomy.

Why this exists
---------------
The exam-level taxonomy (which levels exist, their display labels, their
difficulty order, and which of them are offered as a user *target*) has to exist
in both languages: Python validates level keys and labels them in API responses,
TypeScript renders them. Before this script the two tables were hand-maintained
and kept aligned by a comment in each file asking the reader to "keep in sync" —
an imperative in a comment, which nothing enforces.

Now Python is the source and the TypeScript table is derived. CI regenerates and
fails on any diff, so drift is a failing check instead of a silent divergence.

What is deliberately *not* generated
------------------------------------
Colors. A Tailwind token is a rendering concern and lives with the highlight
class maps in ``examLevels.ts``, which asserts that every generated key has one.
The pure display rules (``maxLevel`` / ``shouldDisplay`` / ``displayLevel``) also
stay hand-written: they are logic over the generated ``order`` values, not data,
and ``displayLevel``'s target-priority rule is a rendering decision.

Usage
-----
    cd backend && python scripts/generate_exam_levels.py

Pure stdlib on purpose — ``app.core.exam_levels`` imports nothing, so this runs
on a bare Python 3.12 with no venv, which is what lets CI run it as a gate.
"""

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
OUTPUT = REPO_ROOT / "frontend" / "src" / "lib" / "examLevels.generated.ts"

sys.path.insert(0, str(BACKEND_ROOT))

# Imported after the path insert above (E402 is disabled repo-wide for exactly
# this pattern) so the script runs from any cwd.
from app.core.exam_levels import EXAM_LEVELS, TARGET_LEVEL_OPTIONS

HEADER = """\
// GENERATED FILE — DO NOT EDIT.
//
// Source of truth: backend/app/core/exam_levels.py
// Regenerate:     cd backend && python scripts/generate_exam_levels.py
//
// CI regenerates this and fails on any diff (.github/workflows/ci.yml), so a
// hand-edit here will be reverted by the next run. Change the Python module.
//
// Not generated, on purpose: the Tailwind color tokens (a rendering concern,
// declared in examLevels.ts alongside the highlight class maps) and the display
// rules over `order`.

/** One exam level: stable key, display label, difficulty order (lower = easier). */
export interface GeneratedExamLevel {
  key: string;
  label: string;
  order: number;
}
"""


def render() -> str:
    lines = [
        HEADER.rstrip("\n"),
        "",
        "/** All levels, in taxonomy (difficulty) order. */",
        "export const EXAM_LEVEL_TAXONOMY: GeneratedExamLevel[] = [",
    ]
    for key, meta in EXAM_LEVELS.items():
        label = str(meta["label"]).replace('"', '\\"')
        lines.append(f'  {{ key: "{key}", label: "{label}", order: {int(meta["order"])} }},')
    lines.append("];")
    lines.append("")
    lines.append('/** Levels offered as a user "target" in the selector. */')
    lines.extend(_string_array("TARGET_LEVEL_KEYS", list(TARGET_LEVEL_OPTIONS)))
    lines.append("")
    return "\n".join(lines)


def _string_array(name: str, values: list[str]) -> list[str]:
    """Emit a ``string[]`` the way prettier would.

    The output has to survive ``npm run format:check`` unchanged, and prettier
    collapses a short array onto one line. Replicating that rule here keeps the
    generated file plain formatted TypeScript — no ``// prettier-ignore`` escape
    hatch — and any mismatch is caught by CI, which regenerates and diffs.
    """
    head = f"export const {name}: string[] = ["
    one_line = head + ", ".join(f'"{v}"' for v in values) + "];"
    # printWidth is 100 (frontend/.prettierrc); values are ASCII so len() is the
    # rendered width.
    if len(one_line) <= 100:
        return [one_line]
    return [head, *(f'  "{v}",' for v in values), "];"]


def main() -> int:
    content = render()
    if OUTPUT.exists() and OUTPUT.read_text(encoding="utf-8") == content:
        print(f"up to date: {OUTPUT.relative_to(REPO_ROOT).as_posix()}")
        return 0
    # newline="\n" is required, not cosmetic: this runs on Windows too, where the
    # default translation would write CRLF and `npm run format:check` (and the
    # CI diff gate) would fail on every line.
    OUTPUT.write_text(content, encoding="utf-8", newline="\n")
    print(f"wrote: {OUTPUT.relative_to(REPO_ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

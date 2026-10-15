"""The generated exam-level taxonomy must match its Python source.

``frontend/src/lib/examLevels.generated.ts`` is derived from
``app/core/exam_levels.py`` by ``scripts/generate_exam_levels.py``. The two
tables used to be hand-maintained with a "keep in sync" comment on each side —
an imperative nothing enforced. This test is the enforcement: it regenerates in
memory and compares, so drift fails here (locally and in CI's existing pytest
run) instead of shipping a frontend that renders a level the backend does not
know about, or vice versa.

Importing the generator rather than re-deriving the expected text on purpose:
anything else would be a third copy of the taxonomy, which is the problem.
"""

import importlib.util
from pathlib import Path
from types import ModuleType

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _REPO_ROOT / "backend" / "scripts" / "generate_exam_levels.py"


def _load_generator() -> ModuleType:
    spec = importlib.util.spec_from_file_location("generate_exam_levels", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_generated_taxonomy_file_exists() -> None:
    output = _load_generator().OUTPUT
    assert output.is_file(), (
        f"{output.relative_to(_REPO_ROOT).as_posix()} is missing — "
        "run: cd backend && python scripts/generate_exam_levels.py"
    )


def test_generated_taxonomy_is_in_sync_with_python() -> None:
    generator = _load_generator()
    committed = generator.OUTPUT.read_text(encoding="utf-8")
    assert committed == generator.render(), (
        f"{generator.OUTPUT.relative_to(_REPO_ROOT).as_posix()} is out of date with "
        "app/core/exam_levels.py — run: cd backend && python scripts/generate_exam_levels.py"
    )

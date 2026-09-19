#!/usr/bin/env python
"""pip-audit gate — block on new advisories, expire the accepted ones.

The gate is ``pip-audit`` over the backend requirement sets, with one addition:
advisories we knowingly accept must be listed in ``backend/.pip-audit-ignore``
together with a review date. An entry whose review date has passed fails the
gate, so a suppression cannot quietly become permanent — it has to be
re-assessed (upgrade, or a new date backed by fresh evidence).

Entries that pip-audit no longer reports are printed as stale; delete them.

Usage (from ``backend/``)::

    python scripts/pip_audit_gate.py
    python scripts/pip_audit_gate.py --today 2027-01-01   # check the expiry path

Exit codes: 0 clean, 1 new advisory, 2 suppression file needs attention,
3 the audit itself could not run.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
IGNORE_FILE = BACKEND_ROOT / ".pip-audit-ignore"
DEFAULT_REQUIREMENTS = ("requirements.txt", "requirements-cloud.txt")
ADVISORY_ID_RE = re.compile(r"^(?:PYSEC|CVE|GHSA|OSV)-\d{4}-[0-9A-Za-z]+$")
MIN_REASON_CHARS = 20

EXIT_OK = 0
EXIT_NEW_ADVISORY = 1
EXIT_IGNORE_FILE = 2
EXIT_AUDIT_ERROR = 3


@dataclass(frozen=True)
class Suppression:
    advisory_id: str
    review_by: dt.date
    owner: str
    reason: str


@dataclass(frozen=True)
class Finding:
    name: str
    version: str
    advisory_id: str
    aliases: tuple[str, ...]
    fix_versions: tuple[str, ...]

    @property
    def keys(self) -> set[str]:
        return {self.advisory_id, *self.aliases}


def parse_suppressions(path: Path) -> tuple[list[Suppression], list[str]]:
    """Return ``(entries, problems)``; problems are human-readable and block the gate."""
    if not path.is_file():
        return [], [f"{path} 不存在"]

    entries: list[Suppression] = []
    problems: list[str] = []
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue

        where = f"{path.name}:{lineno}"
        fields = line.split(None, 3)
        if len(fields) < 4:
            problems.append(f"{where} 需要 4 列（公告 ID、复核日期、负责人、理由），只有 {len(fields)} 列")
            continue
        advisory_id, review_by, owner, reason = fields

        if not ADVISORY_ID_RE.match(advisory_id):
            problems.append(f"{where} 公告 ID 格式不合法：{advisory_id}")
        try:
            due = dt.date.fromisoformat(review_by)
        except ValueError:
            problems.append(f"{where} 复核日期不是 YYYY-MM-DD：{review_by}")
            continue
        if len(reason.strip()) < MIN_REASON_CHARS:
            problems.append(f"{where} 理由太短（<{MIN_REASON_CHARS} 字符），写清为什么该公告不可达")

        entries.append(Suppression(advisory_id, due, owner, reason.strip()))

    counts = Counter(entry.advisory_id for entry in entries)
    problems.extend(f"{path.name} 重复条目：{advisory_id}" for advisory_id, n in sorted(counts.items()) if n > 1)
    return entries, problems


def lapsed_suppressions(entries: list[Suppression], today: dt.date) -> list[Suppression]:
    return [e for e in entries if e.review_by < today]


def run_pip_audit(requirements: list[str], report_path: Path) -> subprocess.CompletedProcess[str]:
    cmd = [
        sys.executable,
        "-m",
        "pip_audit",
        "--skip-editable",
        "--progress-spinner=off",
        "--format=json",
        "-o",
        str(report_path),
    ]
    for requirement in requirements:
        cmd += ["-r", requirement]

    # The requirement files carry Chinese comments; pip-audit decodes them with the
    # locale codec, which is GBK on Windows unless we ask for UTF-8 explicitly.
    env = {**os.environ, "PYTHONUTF8": "1"}
    return subprocess.run(
        cmd,
        cwd=BACKEND_ROOT,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def parse_report(report_path: Path) -> list[Finding]:
    """One ``Finding`` per (package, version, advisory) — pip-audit repeats a row
    once per advisory range it matched, which only adds noise to the report."""
    report = json.loads(report_path.read_text(encoding="utf-8"))
    findings: dict[tuple[str, str, str], Finding] = {}
    for dependency in report.get("dependencies") or []:
        name = str(dependency.get("name", "?"))
        version = str(dependency.get("version", "?"))
        for vuln in dependency.get("vulns") or []:
            advisory_id = str(vuln.get("id", "?"))
            findings.setdefault(
                (name, version, advisory_id),
                Finding(
                    name=name,
                    version=version,
                    advisory_id=advisory_id,
                    aliases=tuple(str(a) for a in (vuln.get("aliases") or [])),
                    fix_versions=tuple(str(f) for f in (vuln.get("fix_versions") or [])),
                ),
            )
    return list(findings.values())


def report_new_advisories(findings: list[Finding], suppressed: set[str]) -> None:
    print(f"::error::{len(findings)} 个未处理的安全公告（{len(suppressed)} 个已在 .pip-audit-ignore 中接受）")
    print()
    print(f"{'package':<28}{'version':<14}{'id':<20}fix versions")
    print("-" * 88)
    for finding in sorted(findings, key=lambda f: (f.name, f.advisory_id)):
        fixes = ",".join(finding.fix_versions) or "(上游未发布修复版本)"
        print(f"{finding.name:<28}{finding.version:<14}{finding.advisory_id:<20}{fixes}")
    print()
    print("升级到修复版本，或（仅当你已证明代码路径不可达时）把它加进 backend/.pip-audit-ignore，附复核日期与理由。")


def report_lapsed(lapsed: list[Suppression]) -> None:
    print(f"::error::{len(lapsed)} 条已接受的安全公告到了复核日期")
    print()
    for entry in lapsed:
        print(f"  {entry.advisory_id}  复核日期 {entry.review_by}  负责人 {entry.owner}")
        print(f"      {entry.reason}")
    print()
    print("逐条重新评估：能升就升；仍要接受就改成新的复核日期，并写清当前证据。")


def report_stale(stale: list[Suppression]) -> None:
    print(f"::warning::{len(stale)} 条已接受的公告不再被 pip-audit 报出，可以删除")
    for entry in stale:
        print(f"  {entry.advisory_id}  ({entry.owner})")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="pip-audit gate with expiring suppressions")
    parser.add_argument(
        "-r", "--requirement", action="append", dest="requirements", help="requirement file (repeatable)"
    )
    parser.add_argument("--today", help="覆盖今天的日期（YYYY-MM-DD），用于验证复核日期路径")
    args = parser.parse_args(argv)

    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    requirements = args.requirements or list(DEFAULT_REQUIREMENTS)

    entries, problems = parse_suppressions(IGNORE_FILE)
    if problems:
        print(f"::error::{IGNORE_FILE.name} 有 {len(problems)} 处问题：")
        for problem in problems:
            print(f"  {problem}")
        return EXIT_IGNORE_FILE

    lapsed = lapsed_suppressions(entries, today)
    if lapsed:
        report_lapsed(lapsed)
        return EXIT_IGNORE_FILE

    suppressed = {entry.advisory_id for entry in entries}
    print(f"已接受的安全公告：{len(suppressed)} 条（{', '.join(sorted(suppressed)) or '无'}）")
    print(f"开始扫描：{', '.join(requirements)}")

    with tempfile.TemporaryDirectory() as tmpdir:
        report_path = Path(tmpdir) / "pip-audit.json"
        result = run_pip_audit(requirements, report_path)
        if result.returncode not in (0, 1) or not report_path.is_file():
            print(f"::error::pip-audit 无法完成（exit {result.returncode}）")
            print(result.stdout[-4000:])
            print(result.stderr[-4000:])
            return EXIT_AUDIT_ERROR
        findings = parse_report(report_path)

    reported = {key for finding in findings for key in finding.keys}
    new = [finding for finding in findings if not (finding.keys & suppressed)]
    stale = [entry for entry in entries if entry.advisory_id not in reported]

    if new:
        report_new_advisories(new, suppressed)
        return EXIT_NEW_ADVISORY

    if stale:
        report_stale(stale)

    print(f"通过：{len(suppressed) - len(stale)} 条接受项仍被报出，无新增公告。")
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())

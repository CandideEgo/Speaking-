"""Invariants for the pip-audit suppression mechanism.

The gate itself (``scripts/pip_audit_gate.py``) needs network access and
pip-audit, so it cannot run as a unit test. What *can* rot silently is the
suppression file: a row that no longer parses, an expired review date, a
"reason" that explains nothing. Those are cheap to check offline, so the gate
never reaches the point of trusting a malformed row.
"""

from __future__ import annotations

import datetime as dt
import json

import pytest

from scripts.pip_audit_gate import (
    IGNORE_FILE,
    MIN_REASON_CHARS,
    Suppression,
    lapsed_suppressions,
    parse_report,
    parse_suppressions,
)


def test_suppression_file_is_well_formed():
    entries, problems = parse_suppressions(IGNORE_FILE)

    assert problems == [], "\n".join(problems)
    assert entries, "接受项文件存在但一行都没解析出来——解析逻辑坏了"


def test_no_suppression_is_past_its_review_date():
    entries, _ = parse_suppressions(IGNORE_FILE)

    expired = lapsed_suppressions(entries, dt.date.today())

    detail = "\n".join(f"{e.advisory_id} 复核日期 {e.review_by}（负责人 {e.owner}）：{e.reason}" for e in expired)
    assert expired == [], f"以下公告到了复核日期，逐条重新评估后再更新日期：\n{detail}"


def test_lapsed_detection_treats_the_review_date_itself_as_valid():
    today = dt.date(2026, 9, 19)
    entries = [
        Suppression("PYSEC-2026-0001", today - dt.timedelta(days=1), "backend", "过期"),
        Suppression("PYSEC-2026-0002", today, "backend", "当天仍有效"),
    ]

    assert [e.advisory_id for e in lapsed_suppressions(entries, today)] == ["PYSEC-2026-0001"]


@pytest.mark.parametrize(
    ("row", "expected_fragment"),
    [
        ("PYSEC-2026-0001 2027-01-01 backend", "需要 4 列"),
        ("not-an-id 2027-01-01 backend " + "x" * MIN_REASON_CHARS, "公告 ID 格式不合法"),
        ("PYSEC-2026-0001 01/01/2027 backend " + "x" * MIN_REASON_CHARS, "复核日期不是 YYYY-MM-DD"),
        ("PYSEC-2026-0001 2027-01-01 backend 太短", "理由太短"),
    ],
)
def test_malformed_rows_are_rejected(tmp_path, row, expected_fragment):
    path = tmp_path / ".pip-audit-ignore"
    path.write_text(row + "\n", encoding="utf-8")

    _, problems = parse_suppressions(path)

    assert any(expected_fragment in problem for problem in problems), problems


def test_duplicate_rows_are_rejected(tmp_path):
    path = tmp_path / ".pip-audit-ignore"
    row = "PYSEC-2026-0001 2027-01-01 backend " + "x" * MIN_REASON_CHARS
    path.write_text(f"{row}\n{row}\n", encoding="utf-8")

    _, problems = parse_suppressions(path)

    assert any("重复条目" in problem for problem in problems), problems


def test_report_rows_are_deduped_and_keep_their_aliases(tmp_path):
    """pip-audit repeats a row once per matched advisory range; aliases must
    survive so a suppression written as GHSA still matches the PYSEC report."""
    path = tmp_path / "report.json"
    path.write_text(
        json.dumps(
            {
                "dependencies": [
                    {
                        "name": "starlette",
                        "version": "0.37.2",
                        "vulns": [
                            {"id": "PYSEC-2026-161", "aliases": ["CVE-2026-48710"], "fix_versions": ["1.0.1"]},
                            {"id": "PYSEC-2026-161", "aliases": ["CVE-2026-48710"], "fix_versions": ["1.0.1"]},
                        ],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    findings = parse_report(path)

    assert len(findings) == 1
    assert findings[0].keys == {"PYSEC-2026-161", "CVE-2026-48710"}

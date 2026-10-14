#!/usr/bin/env python3
"""Deterministic operations for the Spec Flow WorkItem lifecycle.

The prose protocol lives in knowledge/work/README.md and the `/spec-flow` skill. This
helper owns the repeatable parts: stable IDs, scaffolds, stage transitions, index rows,
local validation, and idempotent GitHub issue synchronization.

The helper never decides product or engineering intent. It writes only the structures the
skill has already chosen. GitHub remains the execution source of truth.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(
    os.environ.get("SPEC_FLOW_REPO_ROOT", Path(__file__).resolve().parents[2])
).resolve()

WORK_ID_RE = re.compile(r"^W-\d{8}-\d{2}$")
SLICE_ID_RE = re.compile(r"^S\d{2}$")
WORK_STATUSES = (
    "intake",
    "clarifying",
    "solution_review",
    "solution_approved",
    "planning",
    "plan_review",
    "plan_approved",
    "executing",
    "verifying",
    "done",
    "paused",
    "rejected",
    "superseded",
)
VALID_TRANSITIONS = {
    "intake": {"clarifying", "paused", "rejected", "superseded"},
    "clarifying": {"solution_review", "paused", "rejected", "superseded"},
    "solution_review": {"clarifying", "solution_approved", "paused", "rejected", "superseded"},
    "solution_approved": {"planning", "paused", "superseded"},
    "planning": {"plan_review", "paused", "superseded"},
    "plan_review": {"planning", "plan_approved", "paused", "rejected", "superseded"},
    "plan_approved": {"executing", "paused", "superseded"},
    "executing": {"verifying", "paused", "superseded"},
    "verifying": {"executing", "done", "paused", "superseded"},
    "done": set(),
    "paused": {"clarifying", "solution_review", "planning", "plan_review", "executing", "verifying", "superseded"},
    "rejected": set(),
    "superseded": set(),
}


class SpecFlowError(Exception):
    """A deterministic refusal, suitable for printing without a traceback."""


def work_root() -> Path:
    return REPO_ROOT / "knowledge" / "work"


def index_file() -> Path:
    return REPO_ROOT / "knowledge" / "INDEX.md"


def slugify(value: str) -> str:
    slug = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff._-]+", "-", value.strip()).strip("-._")
    return slug or "work-item"


def today() -> str:
    return dt.date.today().isoformat()


def split_frontmatter(text: str) -> tuple[dict[str, str], str, bool]:
    if not text.startswith("---\n") and not text.startswith("---\r\n"):
        return {}, text, False
    match = re.match(r"\A---\r?\n(.*?)\r?\n---\r?\n?", text, re.DOTALL)
    if not match:
        return {}, text, False
    fields: dict[str, str] = {}
    for raw in match.group(1).splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        key, sep, value = raw.partition(":")
        if sep:
            fields[key.strip()] = value.strip()
    return fields, text[match.end():], True


def render_frontmatter(fields: dict[str, str]) -> str:
    lines = ["---"]
    lines.extend(f"{key}: {value}" for key, value in fields.items())
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def write_frontmatter(path: Path, updates: dict[str, str | None]) -> dict[str, str]:
    fields, body, present = split_frontmatter(path.read_text(encoding="utf-8"))
    if not present:
        raise SpecFlowError(f"{path}: missing frontmatter")
    for key, value in updates.items():
        if value is None:
            fields.pop(key, None)
        else:
            fields[key] = value
    path.write_text(render_frontmatter(fields) + body, encoding="utf-8")
    return fields


def read_fields(path: Path) -> dict[str, str]:
    fields, _body, present = split_frontmatter(path.read_text(encoding="utf-8"))
    if not present:
        raise SpecFlowError(f"{path}: missing frontmatter")
    return fields


def parse_list(value: str) -> list[str]:
    inner = value.strip()
    if inner.startswith("[") and inner.endswith("]"):
        inner = inner[1:-1]
    return [item.strip().strip("'\"") for item in inner.split(",") if item.strip()]


def workitem_dirs() -> list[Path]:
    root = work_root()
    if not root.is_dir():
        return []
    return sorted(
        path
        for path in root.iterdir()
        if path.is_dir() and WORK_ID_RE.match(path.name[:13]) and path.name[13:14] == "-"
    )


def find_workitem(work_id: str) -> Path:
    for directory in workitem_dirs():
        if directory.name[:13] == work_id:
            return directory
    raise SpecFlowError(f"WorkItem {work_id} not found")


def allocate_workitem_id(date: str) -> str:
    prefix = f"W-{date.replace('-', '')}-"
    serials = []
    for directory in workitem_dirs():
        if directory.name.startswith(prefix):
            try:
                serials.append(int(directory.name[len(prefix):len(prefix) + 2]))
            except ValueError:
                continue
    serial = max(serials, default=0) + 1
    if serial > 99:
        raise SpecFlowError(f"more than 99 WorkItems on {date}")
    return prefix + f"{serial:02d}"


def workitem_template(work_id: str, title: str, sources: list[str]) -> str:
    source_list = ", ".join(sources)
    return f"""---
work_item: {work_id}
title: {title}
status: intake
created: {today()}
updated: {today()}
sources: [{source_list}]
parent_issue: null
sync_state: pending
---

# {work_id} — {title}

> 本文件是 WorkItem 的总结构，只保留全局方向、阶段与切片地图、当前前沿和效果。细节进入阶段文件。

## 1. 结果与边界

- 期望结果：待澄清。
- 本轮范围：待澄清。
- 明确不做：待澄清。
- 完成判据：待澄清。

## 2. 阶段地图

| 阶段 | 产物 | 状态 | 审批 | 入口 |
|---|---|---|---|---|
| Intent | `intent.md` | draft | — | 已创建 |
| Research | `research.md` | 未开始 | — | 按需生成 |
| Solution | `solution.md` | 未开始 | — | 按需生成 |
| Plan | `plan.md` | 未开始 | — | 按需生成 |
| Execution | `slices/Sxx-*.md` | 未开始 | — | 计划确认后创建 Issue |

## 3. 切片地图

| ID | 切片 | 产出 | 依赖 | 状态 | Issue | 证据 |
|---|---|---|---|---|---|---|

## 4. 当前前沿

- Ready：待研究阶段收敛。
- In progress：无。
- Blocked：无。
- Deferred：无。

## 5. 效果仪表盘

| 指标 | 基线 | 目标 | 当前 | 证据 |
|---|---:|---:|---:|---|

## 6. 上下文顺序

- T0：`AGENTS.md`、`.agent/invariants.md`、`.agent/state.md` 当前焦点。
- T1：本文件的结果、阶段地图、切片地图和当前前沿。
- T2：当前阶段文件或当前切片全文。
- T3：当前切片列出的 owner row、契约、实现文件和测试。

## 7. 收敛规则

- 方案与实施计划各有人工确认闸门。
- 一张切片一个 Issue；认领、阻塞、PR 和关闭以 GitHub 为准。
- 一个执行会话只完成一张切片；发现的新工作先登记为新切片或明确 defer。
- 证据不足时最高状态是 `verifying`，不能写 `done`。
"""


def intent_template(work_id: str, title: str, sources: list[str]) -> str:
    source_lines = "\n".join(f"- `{source}`" for source in sources) or "- 待补原始来源。"
    return f"""---
phase: intent
status: draft
revision: 1
---

# Intent — {title}

> WorkItem：`{work_id}`

## 原始来源

{source_lines}

## 问题

待澄清。

## 期望结果

待澄清。

## 成功判据

- 待澄清。

## 约束与非目标

- 待澄清。

## 尚未解决的问题

- 由 `/spec-flow clarify` 收敛。
"""


def create_workitem(title: str, slug: str | None, sources: list[str], date: str) -> Path:
    if not title.strip():
        raise SpecFlowError("title cannot be empty")
    work_id = allocate_workitem_id(date)
    directory = work_root() / f"{work_id}-{slug or slugify(title)}"
    if directory.exists():
        raise SpecFlowError(f"{directory} already exists")
    directory.mkdir(parents=True)
    (directory / "README.md").write_text(workitem_template(work_id, title, sources), encoding="utf-8")
    (directory / "intent.md").write_text(intent_template(work_id, title, sources), encoding="utf-8")
    reindex()
    return directory


WORK_STAGE_ORDER = {"README.md": 0, "intent.md": 1, "research.md": 2, "solution.md": 3, "plan.md": 4}


def index_row_key(path: Path) -> tuple:
    """Control plane before slices, README first; the cold-store index is read by a person."""
    parts = path.relative_to(work_root()).parts
    if len(parts) == 1:
        return (0, "", 0, "")
    return (1, parts[0].casefold(), WORK_STAGE_ORDER.get(parts[-1], 5), parts[-1].casefold())


def index_rows() -> list[str]:
    root = work_root()
    rows: list[str] = []
    for path in sorted(root.rglob("*.md"), key=index_row_key):
        if any(part == "evidence" for part in path.parts):
            continue
        fields, body, _present = split_frontmatter(path.read_text(encoding="utf-8"))
        title = fields.get("title") or fields.get("work_item")
        if not title:
            # Stage files carry their name in the H1, not in frontmatter; a bare
            # `intent`/`plan` row in the cold-store index tells a reader nothing.
            heading = re.search(r"^#\s+(.+?)\s*$", body, re.MULTILINE)
            title = heading.group(1).strip() if heading else path.stem
        target = path.relative_to(REPO_ROOT / "knowledge").as_posix()
        rows.append(f"- [{title}]({target})")
    return rows


def reindex() -> None:
    path = index_file()
    if not path.is_file():
        raise SpecFlowError(f"{path}: missing knowledge index")
    text = path.read_text(encoding="utf-8")
    block = "\n".join(
        [
            "## 工作项：持续工作与切片",
            "",
            "<!-- spec-flow:index:start -->",
            *index_rows(),
            "<!-- spec-flow:index:end -->",
        ]
    )
    pattern = re.compile(
        r"## 工作项：持续工作与切片\n.*?<!-- spec-flow:index:end -->",
        re.DOTALL,
    )
    if pattern.search(text):
        text = pattern.sub(block, text, count=1)
    else:
        marker = "## 方案："
        if marker not in text:
            raise SpecFlowError(f"{path}: cannot find insertion marker '{marker}'")
        text = text.replace(marker, block + "\n\n" + marker, 1)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def set_status(work_id: str, status: str) -> None:
    directory = find_workitem(work_id)
    root = directory / "README.md"
    current = read_fields(root).get("status", "")
    if status not in WORK_STATUSES:
        raise SpecFlowError(f"invalid status '{status}'")
    if current == status:
        return
    if status not in VALID_TRANSITIONS.get(current, set()):
        raise SpecFlowError(f"illegal transition {current} -> {status}")
    write_frontmatter(root, {"status": status, "updated": today()})


def approve(work_id: str, phase: str, approver: str) -> None:
    if phase not in {"solution", "plan"}:
        raise SpecFlowError("phase must be solution or plan")
    directory = find_workitem(work_id)
    phase_path = directory / f"{phase}.md"
    if not phase_path.is_file():
        raise SpecFlowError(f"{phase_path}: phase file does not exist")
    fields = read_fields(phase_path)
    if fields.get("status") not in {"review", "draft"}:
        raise SpecFlowError(f"{phase_path}: status must be review or draft before approval")
    if not approver.strip():
        raise SpecFlowError("approver cannot be empty")
    write_frontmatter(
        phase_path,
        {
            "status": "approved",
            "approved_by": approver,
            "approved_at": today(),
            "approval_ref": fields.get("approval_ref") or "pending",
        },
    )
    root_status = "solution_approved" if phase == "solution" else "plan_approved"
    set_status(work_id, root_status)


def local_validate(workitem: Path) -> list[str]:
    errors: list[str] = []
    root = workitem / "README.md"
    if not root.is_file():
        return [f"{workitem}: missing README.md"]
    fields = read_fields(root)
    work_id = workitem.name[:13]
    if fields.get("work_item") != work_id:
        errors.append(f"{root}: work_item does not match directory")
    if fields.get("status") not in WORK_STATUSES:
        errors.append(f"{root}: invalid status")
    for phase, filename in (("intent", "intent.md"), ("research", "research.md"), ("solution", "solution.md"), ("plan", "plan.md")):
        path = workitem / filename
        if path.exists() and read_fields(path).get("phase") != phase:
            errors.append(f"{path}: phase must be {phase}")
    slices = sorted((workitem / "slices").glob("*.md")) if (workitem / "slices").is_dir() else []
    seen: set[str] = set()
    graph: dict[str, list[str]] = {}
    for slice_path in slices:
        slice_fields = read_fields(slice_path)
        slice_id = slice_fields.get("slice", "")
        if not SLICE_ID_RE.match(slice_id):
            errors.append(f"{slice_path}: invalid slice id")
            continue
        if slice_id in seen:
            errors.append(f"{slice_path}: duplicate slice id {slice_id}")
        seen.add(slice_id)
        graph[slice_id] = [item for item in parse_list(slice_fields.get("depends_on", "")) if item]
    for slice_id, dependencies in graph.items():
        for dependency in dependencies:
            if dependency not in graph:
                errors.append(f"slice {slice_id}: unknown dependency {dependency}")
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(slice_id: str) -> None:
        if slice_id in visited:
            return
        if slice_id in visiting:
            errors.append(f"slice dependency cycle at {slice_id}")
            return
        visiting.add(slice_id)
        for dependency in graph.get(slice_id, []):
            if dependency in graph:
                visit(dependency)
        visiting.remove(slice_id)
        visited.add(slice_id)

    for slice_id in graph:
        visit(slice_id)
    plan = workitem / "plan.md"
    if plan.is_file():
        text = plan.read_text(encoding="utf-8")
        for slice_id in graph:
            if not re.search(rf"\b{re.escape(slice_id)}\b", text):
                errors.append(f"{plan}: missing slice {slice_id}")
    return errors


def gh(args: list[str], *, check: bool = True) -> str:
    completed = subprocess.run(
        ["gh", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if check and completed.returncode != 0:
        raise SpecFlowError(
            f"gh {' '.join(args)} failed ({completed.returncode}): {completed.stderr.strip()}"
        )
    return completed.stdout.strip()


def issue_number_from_url(output: str) -> int:
    match = re.search(r"/issues/(\d+)\s*$", output)
    if not match:
        raise SpecFlowError(f"could not parse issue number from: {output}")
    return int(match.group(1))


def ensure_label(name: str, color: str, description: str) -> None:
    gh(["label", "create", name, "--color", color, "--description", description, "--force"])


def parent_body(workitem: Path) -> str:
    root = workitem / "README.md"
    solution = workitem / "solution.md"
    fields = read_fields(root)
    return "\n".join(
        [
            f"WorkItem `{fields.get('work_item')}`: {fields.get('title')}",
            "",
            f"Control plane: `{root.relative_to(REPO_ROOT).as_posix()}`",
            f"Solution: `{solution.relative_to(REPO_ROOT).as_posix()}`",
            "",
            "<!-- spec-flow:tasks:start -->",
            "<!-- spec-flow:tasks:end -->",
        ]
    )


def slice_body(workitem: Path, slice_path: Path) -> str:
    fields = read_fields(slice_path)
    return "\n".join(
        [
            f"Parent WorkItem: `{workitem.name[:13]}`",
            f"Slice: `{fields.get('slice')}` — {fields.get('title', slice_path.stem)}",
            "",
            f"Contract: `{slice_path.relative_to(REPO_ROOT).as_posix()}`",
            "",
            "Acceptance, evidence and rollback live in the linked slice file.",
        ]
    )


def create_issue(title: str, body: str, labels: list[str]) -> int:
    args = ["issue", "create", "--title", title, "--body", body]
    for label in labels:
        args += ["--label", label]
    return issue_number_from_url(gh(args))


def issue_db_id(number: int) -> str:
    return gh(
        ["api", f"repos/{{owner}}/{{repo}}/issues/{number}", "--jq", ".id"]
    ).strip()


def add_blocker(child: int, blocker: int) -> None:
    blocker_id = issue_db_id(blocker)
    gh(
        [
            "api",
            "--method",
            "POST",
            f"repos/{{owner}}/{{repo}}/issues/{child}/dependencies/blocked_by",
            "-F",
            f"issue_id={blocker_id}",
        ]
    )


def update_parent_tasks(workitem: Path, parent: int) -> None:
    slices = sorted((workitem / "slices").glob("*.md"))
    lines = []
    for path in slices:
        fields = read_fields(path)
        checked = "x" if fields.get("status") == "done" else " "
        issue = fields.get("issue", "TBD")
        lines.append(f"- [{checked}] #{issue} {fields.get('slice')} {fields.get('title', path.stem)}")
    body = gh(["issue", "view", str(parent), "--json", "body", "--jq", ".body"])
    replacement = "\n".join(
        ["<!-- spec-flow:tasks:start -->", *lines, "<!-- spec-flow:tasks:end -->"]
    )
    updated = re.sub(
        r"<!-- spec-flow:tasks:start -->.*?<!-- spec-flow:tasks:end -->",
        replacement,
        body,
        flags=re.DOTALL,
    )
    gh(["issue", "edit", str(parent), "--body", updated])


def record_approval_comment(workitem: Path, parent: int, phase: str) -> str:
    """Post the phase approval comment once, and return its URL."""
    phase_path = workitem / f"{phase}.md"
    fields = read_fields(phase_path)
    existing = fields.get("approval_ref", "")
    if existing and existing not in {"pending", "null"}:
        return existing
    body = "\n".join(
        [
            f"Spec Flow approval: **{phase}**",
            f"Artifact: `{phase_path.relative_to(REPO_ROOT).as_posix()}`",
            f"Approved by: {fields.get('approved_by', 'unknown')}",
            f"Approved at: {fields.get('approved_at', today())}",
            f"Revision: {fields.get('revision', '1')}",
        ]
    )
    url = gh(["issue", "comment", str(parent), "--body", body])
    write_frontmatter(phase_path, {"approval_ref": url})
    return url


def sync_issues(workitem: Path, stage: str, apply: bool) -> dict:
    fields = read_fields(workitem / "README.md")
    if stage == "solution":
        if fields.get("solution_approved") != "true" and not (workitem / "solution.md").is_file():
            raise SpecFlowError("solution.md is required before the parent issue")
    if stage == "plan":
        if not (workitem / "plan.md").is_file():
            raise SpecFlowError("plan.md is required before child issues")
    planned = {
        "work_item": workitem.name,
        "stage": stage,
        "parent_issue": fields.get("parent_issue"),
        "slices": [],
        "apply": apply,
    }
    if not apply:
        for path in sorted((workitem / "slices").glob("*.md")):
            slice_fields = read_fields(path)
            planned["slices"].append(
                {
                    "slice": slice_fields.get("slice"),
                    "issue": slice_fields.get("issue"),
                    "depends_on": parse_list(slice_fields.get("depends_on", "")),
                }
            )
        return planned

    ensure_label("spec-flow:workitem", "1f6feb", "Spec Flow WorkItem parent")
    parent = int(fields["parent_issue"]) if fields.get("parent_issue") not in {"", "null", None} else None
    if parent is None:
        parent = create_issue(
            f"[{fields['work_item']}] {fields['title']}",
            parent_body(workitem),
            ["spec-flow:workitem"],
        )
        write_frontmatter(workitem / "README.md", {"parent_issue": str(parent), "updated": today()})
        planned["parent_issue"] = parent
    record_approval_comment(workitem, parent, "solution")
    if stage == "solution":
        return planned

    ensure_label("spec-flow:slice", "0969da", "Spec Flow executable slice")
    ensure_label("ready-for-agent", "0e8a16", "Ready for an agent to pick up")
    for path in sorted((workitem / "slices").glob("*.md")):
        slice_fields = read_fields(path)
        if slice_fields.get("issue") in {"", "null", None}:
            number = create_issue(
                f"[{fields['work_item']}/{slice_fields['slice']}] {slice_fields.get('title', path.stem)}",
                slice_body(workitem, path),
                ["spec-flow:slice", "ready-for-agent"],
            )
            write_frontmatter(path, {"issue": str(number), "updated": today()})
        planned["slices"].append(
            {"slice": slice_fields.get("slice"), "issue": read_fields(path).get("issue")}
        )

    for path in sorted((workitem / "slices").glob("*.md")):
        slice_fields = read_fields(path)
        child = int(slice_fields["issue"])
        for dependency in parse_list(slice_fields.get("depends_on", "")):
            blocker_paths = list((workitem / "slices").glob(f"{dependency}-*.md"))
            if len(blocker_paths) != 1:
                raise SpecFlowError(f"cannot resolve blocker {dependency} for {slice_fields['slice']}")
            blocker = int(read_fields(blocker_paths[0])["issue"])
            add_blocker(child, blocker)
    write_frontmatter(workitem / "README.md", {"sync_state": "synced", "updated": today()})
    update_parent_tasks(workitem, parent)
    record_approval_comment(workitem, parent, "plan")
    return planned


def issue_state(workitem: Path) -> dict:
    fields = read_fields(workitem / "README.md")
    result: dict = {"work_item": workitem.name, "parent": None, "slices": []}
    parent = fields.get("parent_issue")
    if parent and parent != "null":
        result["parent"] = json.loads(
            gh(["issue", "view", parent, "--json", "number,state,title,assignees"])
        )
    for path in sorted((workitem / "slices").glob("*.md")):
        slice_fields = read_fields(path)
        issue = slice_fields.get("issue")
        if not issue or issue == "null":
            result["slices"].append({"slice": slice_fields.get("slice"), "issue": None})
            continue
        data = json.loads(
            gh(["issue", "view", issue, "--json", "number,state,title,assignees"])
        )
        data["slice"] = slice_fields.get("slice")
        result["slices"].append(data)
    return result


def command_new(args: argparse.Namespace) -> int:
    path = create_workitem(args.title, args.slug, args.source, args.date)
    print(path)
    return 0


def command_reindex(_args: argparse.Namespace) -> int:
    reindex()
    print("knowledge index WorkItem rows refreshed")
    return 0


def command_validate(args: argparse.Namespace) -> int:
    targets = [find_workitem(args.work_item)] if args.work_item else workitem_dirs()
    errors = [error for target in targets for error in local_validate(target)]
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print(f"validated {len(targets)} WorkItem(s)")
    return 0


def command_set_status(args: argparse.Namespace) -> int:
    set_status(args.work_item, args.status)
    print(f"{args.work_item}: {args.status}")
    return 0


def command_approve(args: argparse.Namespace) -> int:
    approve(args.work_item, args.phase, args.by)
    print(f"{args.work_item}: {args.phase} approved by {args.by}")
    return 0


def command_issue_sync(args: argparse.Namespace) -> int:
    workitem = find_workitem(args.work_item)
    result = sync_issues(workitem, args.stage, args.apply)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def command_issue_state(args: argparse.Namespace) -> int:
    print(json.dumps(issue_state(find_workitem(args.work_item)), ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    new = sub.add_parser("new", help="create a WorkItem and its intent")
    new.add_argument("title")
    new.add_argument("--slug")
    new.add_argument("--date", default=today())
    new.add_argument("--source", action="append", default=[])
    new.set_defaults(func=command_new)

    reindex_parser = sub.add_parser("reindex", help="refresh the WorkItem block in knowledge/INDEX.md")
    reindex_parser.set_defaults(func=command_reindex)

    validate = sub.add_parser("validate", help="validate one or all WorkItems locally")
    validate.add_argument("--work-item")
    validate.set_defaults(func=command_validate)

    status = sub.add_parser("set-status", help="apply one root lifecycle transition")
    status.add_argument("work_item")
    status.add_argument("status", choices=WORK_STATUSES)
    status.set_defaults(func=command_set_status)

    approve_parser = sub.add_parser("approve", help="record an explicit human approval gate")
    approve_parser.add_argument("work_item")
    approve_parser.add_argument("phase", choices=("solution", "plan"))
    approve_parser.add_argument("--by", required=True)
    approve_parser.set_defaults(func=command_approve)

    sync = sub.add_parser("issue-sync", help="create or reconcile parent/child GitHub issues")
    sync.add_argument("work_item")
    sync.add_argument("--stage", choices=("solution", "plan"), required=True)
    sync.add_argument("--apply", action="store_true", help="execute the gh commands; default is a dry run")
    sync.set_defaults(func=command_issue_sync)

    issue_state_parser = sub.add_parser("issue-state", help="read GitHub issue state for status/sync")
    issue_state_parser.add_argument("work_item")
    issue_state_parser.set_defaults(func=command_issue_state)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except SpecFlowError as error:
        print(f"spec-flow: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

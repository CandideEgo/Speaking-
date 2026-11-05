#!/usr/bin/env python
"""V2 content inventory, resumable verification and audited publication.

    python scripts/qualify_teaching_content.py inventory
    python scripts/qualify_teaching_content.py check-manifest candidate.json
    python scripts/qualify_teaching_content.py import-manifest candidate.json --actor-id ADMIN_ID --operation-id IMPORT_ID
    python scripts/qualify_teaching_content.py plan-verification candidate.json --job-dir JOB --models ALIAS_A ALIAS_B
    python scripts/qualify_teaching_content.py run-verification --job-dir JOB
    python scripts/qualify_teaching_content.py recover-verification --job-dir JOB --step 0 --receipt receipt.json

Import additionally requires the gateway adapter's authenticated receipt
verifier. An unverified receipt ID or legacy explanation is never publication
evidence. Only run-verification calls the budget-governed gateway. Preparation,
recovery and checks never call models. This CLI does not grant material rights.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.errors import AppError
from app.services.teaching import publication
from app.services.teaching.content import normalized_question, validate_candidate
from scripts import content_verification_job


def _records(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else [data]


def inventory(root: Path) -> dict:
    summaries = []
    questions: dict[tuple, list[dict]] = {}
    for path in sorted((root / "papers").glob("*.json")):
        papers = _records(path)
        rows = [question for paper in papers for question in paper.get("questions", [])]
        summaries.append(
            {
                "file": path.name,
                "papers": len(papers),
                "questions": len(rows),
                "reading_c": sum(q.get("section") == "reading_C" for q in rows),
                "with_explanation": sum(bool(q.get("explanation")) for q in rows),
                "levels": dict(Counter(p["level"] for p in papers)),
            }
        )
        for paper in papers:
            if paper["level"] != "cet4":
                continue
            for q in paper.get("questions", []):
                if q.get("section") != "reading_C":
                    continue
                identity = (paper["level"], paper["year"], paper["month"], paper["set_no"], q["number"])
                payload = {**q, **{key: paper[key] for key in ("level", "year", "month", "set_no")}}
                questions.setdefault(identity, []).append(
                    {
                        "file": path.name,
                        "source": paper.get("source"),
                        "answer": q.get("answer"),
                        "payload": normalized_question(payload),
                    }
                )
    candidates = []
    for set_no in (1, 2):
        for number in range(46, 56):
            key = ("cet4", 2025, 12, set_no, number)
            records = questions.get(key, [])
            comparison = [record for record in records if record["file"] in {"guojiya_cet4.json", "xdf_papers.json"}]
            reasons = [
                "material_rights_unknown",
                "authenticated_blind_model_receipts_missing",
                "teaching_semantic_review_receipts_missing",
            ]
            if len(comparison) < 2:
                reasons.append("independent_answer_sources_missing")
            elif len({record["answer"] for record in comparison}) != 1:
                reasons.append("source_answer_conflict")
            if comparison and any(record["payload"] != comparison[0]["payload"] for record in comparison[1:]):
                reasons.append("source_question_conflict")
            pdf = root / "exam_pdfs" / "files" / f"cet4_2025-12_{set_no:02}.pdf"
            if not pdf.is_file():
                reasons.append("paper_pdf_missing")
            candidates.append(
                {
                    "question_key": ":".join(["exam", *map(str, key)]),
                    "source_files": [r["file"] for r in records],
                    "paper_pdf_present": pdf.is_file(),
                    "status": "quarantined",
                    "blockers": reasons,
                }
            )
    return {
        "read_only": True,
        "source_root": str(root.resolve()),
        "summaries": summaries,
        "initial_type": "cet4:reading_C:ABCD",
        "target_count": 20,
        "verified_in_source_artifacts": 0,
        "candidates": candidates,
        "note": "Source attribution and local PDF existence do not establish permission, answer correctness or authenticated model review. No database or provider was contacted.",
    }


async def manifests(
    path: Path, *, publish=False, actor_id: str | None = None, operation_id: str | None = None
) -> tuple[dict, int]:
    records = _records(path)
    output = []
    for candidate in records:
        try:
            checked = validate_candidate(candidate)
            output.append(
                {
                    "question_key": checked["question_key"],
                    "structural_checks": "passed",
                    "receipts_authenticated": False,
                    "published": False,
                }
            )
        except (AppError, KeyError, TypeError, ValueError) as exc:
            output.append(
                {
                    "question_key": candidate.get("question_key") if isinstance(candidate, dict) else None,
                    "structural_checks": "failed",
                    "reason": getattr(exc, "message", str(exc)),
                    "published": False,
                }
            )
    if any(row["structural_checks"] != "passed" for row in output):
        return {"items": output, "published": 0}, 1
    if not publish:
        return {
            "items": output,
            "published": 0,
            "note": "Structural checks do not authenticate upstream receipts or publish content.",
        }, 0
    if publication.receipt_verifier() is None and (not actor_id or not operation_id):
        return {
            "items": output,
            "published": 0,
            "code": "SERVICE_UNAVAILABLE",
            "reason": "Authenticated gateway content-receipt verifier is not available; no database writes were attempted.",
        }, 2
    if not actor_id or not operation_id or len(operation_id) > 64:
        return {
            "published": 0,
            "code": "FORBIDDEN",
            "reason": "An active administrator actor ID and a stable operation ID (1-64 characters) are required.",
        }, 2
    from app.core.database import get_async_session_maker

    async with get_async_session_maker()() as db:
        await publication.require_admin_actor(db, actor_id)
        replayed = await publication.import_replayed(db, actor_id, operation_id, records)
    # Each supplied receipt is authenticated outside a DB transaction. A failed
    # proof leaves no draft, release or operation receipt behind.
    proofs: list[publication.VerifiedManifest | None] = (
        [None] * len(records)
        if replayed
        else [await publication.verify_publication(publication.PublicationInput(record)) for record in records]
    )
    async with get_async_session_maker()() as db:
        try:
            results = await publication.import_verified(db, actor_id, operation_id, records, proofs)
            await db.commit()
        except Exception:
            await db.rollback()
            raise
    return {
        "published": sum(result.publication_status == "auto_verified" for result in results),
        "items": [
            {
                **row,
                "receipts_authenticated": True,
                "published": result.publication_status == "auto_verified",
                "publication_status": result.publication_status,
                "revision_id": result.published_revision_id,
                "replayed": result.replayed,
            }
            for row, result in zip(output, results, strict=True)
        ],
    }, 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    inv = commands.add_parser("inventory")
    inv.add_argument("--data-root", type=Path, default=Path("data"))
    for command in ("check-manifest", "import-manifest"):
        check = commands.add_parser(command)
        check.add_argument("path", type=Path)
        if command == "import-manifest":
            check.add_argument("--actor-id")
            check.add_argument("--operation-id")
    prepare = commands.add_parser("plan-verification")
    prepare.add_argument("path", type=Path)
    prepare.add_argument("--job-dir", type=Path, required=True)
    prepare.add_argument("--models", nargs=2, required=True)
    for command in ("run-verification", "recover-verification"):
        job = commands.add_parser(command)
        job.add_argument("--job-dir", type=Path, required=True)
        if command == "recover-verification":
            job.add_argument("--step", type=int, required=True)
            job.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "inventory":
            result, status = inventory(args.data_root), 0
        elif args.command == "plan-verification":
            result, status = content_verification_job.prepare(args.path, args.job_dir, args.models), 0
        elif args.command == "run-verification":
            result = asyncio.run(content_verification_job.execute(args.job_dir))
            status = 0 if result["status"] == "qualified" else 2
        elif args.command == "recover-verification":
            result, status = asyncio.run(content_verification_job.recover(args.job_dir, args.step, args.receipt)), 0
        else:
            result, status = asyncio.run(
                manifests(
                    args.path,
                    publish=args.command == "import-manifest",
                    actor_id=getattr(args, "actor_id", None),
                    operation_id=getattr(args, "operation_id", None),
                )
            )
    except AppError as exc:
        result, status = {"published": 0, "code": exc.code, "reason": exc.message}, 2
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        result, status = (
            {"published": 0, "code": "VALIDATION_ERROR", "reason": "输入或核验文件无效、已存在或不可访问"},
            2,
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return status


if __name__ == "__main__":
    raise SystemExit(main())

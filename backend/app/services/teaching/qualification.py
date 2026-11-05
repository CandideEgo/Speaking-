"""Prepare bounded content verification work; collection never publishes."""

import copy
import json

from app.core.errors import AppError
from app.services import teaching_gateway
from app.services.teaching import content


def plan(candidate: dict, models: list[str]) -> dict:
    if (
        len(models) != 2
        or any(not isinstance(m, str) or not m.strip() or m != m.strip() or len(m) > 200 for m in models)
        or len(set(models)) != 2
    ):
        raise AppError(422, "VALIDATION_ERROR", "核验计划需要两个不同的模型别名，实际模型族仍由签名结果验证")
    material = copy.deepcopy(candidate)
    if len(json.dumps(material, ensure_ascii=False, allow_nan=False).encode()) > 131072:
        raise AppError(422, "VALIDATION_ERROR", "候选材料超过 128 KiB 上限")
    checked = content.validate_material(material)
    if material["rights_policy"]["model_processing"] is not True:
        raise AppError(403, "FORBIDDEN", "材料未获准发送给模型")
    # Existing, possibly untrusted receipts are not carried into a new job.
    material["verification_report"]["blind_answers"] = []
    material["verification_report"]["teaching_checks"] = []
    steps = []
    for i, model in enumerate(models):
        steps.append(
            {
                "kind": "blind-answer-v1",
                "payload": {
                    "model": model,
                    "input": checked["question_payload"],
                    "option_order": list(("CADB", "BDAC")[i]),
                },
            }
        )
    for model in models:
        steps.append(
            {
                "kind": "teaching-review-v1",
                "payload": {"model": model, "input": content.teaching_review_input(material)},
            }
        )
    return {"version": 1, "candidate": material, "models": models, "steps": steps}


def result_passes(prepared: dict, step: dict, receipt: dict) -> bool:
    if step["kind"] == "blind-answer-v1":
        return bool(
            receipt["option_order"][receipt["selected_position"]]
            == prepared["candidate"]["correct_answer"].strip().upper()
        )
    return all(value is True for value in receipt["checks"].values())


async def authenticate_step(step: dict, receipt: dict) -> None:
    if not await teaching_gateway.verify_content_receipt(receipt):
        raise AppError(422, "VALIDATION_ERROR", "核验收据签名或有效期无效")
    payload = step["payload"]
    blind = step["kind"] == "blind-answer-v1"
    if (
        receipt["input_sha256"] != content.stable_hash(payload["input"])
        or (blind and receipt.get("option_order") != payload["option_order"])
        or (blind and "selected_position" not in receipt)
        or (not blind and "checks" not in receipt)
    ):
        raise AppError(422, "VALIDATION_ERROR", "核验收据不属于当前输入或步骤")


async def assemble(prepared: dict, receipts: list[dict]) -> dict:
    if len(receipts) != len(prepared["steps"]):
        raise AppError(409, "CONFLICT", "核验步骤尚未完成")
    material: dict = copy.deepcopy(prepared["candidate"])
    for step, receipt in zip(prepared["steps"], receipts, strict=True):
        await authenticate_step(step, receipt)
        key = "blind_answers" if step["kind"] == "blind-answer-v1" else "teaching_checks"
        material["verification_report"][key].append(copy.deepcopy(receipt))
    # Same independent-family, answer consensus and semantic gate as publication.
    content.validate_candidate(material)
    if len(json.dumps(material, ensure_ascii=False, allow_nan=False).encode()) > 131072:
        raise AppError(422, "VALIDATION_ERROR", "核验产物超过发布材料上限")
    return material

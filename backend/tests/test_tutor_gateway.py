"""Strict cited tutor output on the shared bounded gateway transport."""

import json
from datetime import UTC, datetime, timedelta

import pytest

from app.core.errors import AppError
from app.services import teaching_gateway
from tests.test_teaching_dialogue import model


def context():
    return {
        "learning_context": {
            "task": {"session_id": "one"},
            "progress": {},
            "cards": [
                {"kind": kind, "card_id": "one:" + kind, "payload": {}} for kind in ("question", "analysis", "evidence")
            ],
        },
        "history": [],
        "history_truncated": False,
    }


@pytest.mark.parametrize(
    "defect",
    ["bad_index", "boolean_index", "duplicate", "no_citation", "extra_action", "blank", "bad_answer", "bad_text_type"],
)
async def test_invalid_model_reply_cannot_become_a_message(monkeypatch, defect):
    value = {"text": "原文支持这个比较。", "citations": [1], "suggested_answer": None}
    if defect == "bad_index":
        value["citations"] = [99]
    elif defect == "boolean_index":
        value["citations"] = [True]
    elif defect == "duplicate":
        value["citations"] = [1, 1]
    elif defect == "no_citation":
        value["citations"] = []
    elif defect == "extra_action":
        value["submit"] = {"answer": "B"}
    elif defect == "blank":
        value["text"] = " "
    elif defect == "bad_answer":
        value["suggested_answer"] = "E"
    else:
        value["text"] = 1
    calls = model(monkeypatch, response=value)
    with pytest.raises(AppError) as exc:
        await teaching_gateway.tutor_reply(
            "u", "r", "call", "question", context(), datetime.now(UTC) + timedelta(seconds=30)
        )
    assert exc.value.status_code == 502 and len(calls) == 1


async def test_fresh_context_replaces_stale_sources_without_changing_model_authority(monkeypatch):
    calls = model(monkeypatch)
    original = context()
    fresh = context()
    for card in fresh["learning_context"]["cards"]:
        card["card_id"] = card["card_id"].replace("one:", "fresh:")
    reply = await teaching_gateway.tutor_reply(
        "u",
        "r",
        "call",
        "question",
        original,
        datetime.now(UTC) + timedelta(seconds=30),
        before_dispatch=lambda: _fresh(fresh),
    )
    assert reply.citation_ids == ["fresh:analysis", "fresh:evidence"]
    assert len(calls) == 1 and "submit" not in json.dumps(calls[0].get("tools", []))


async def _fresh(value):
    return value

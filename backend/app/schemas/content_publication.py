"""Admin-only candidate input; verification facts are never supplied as flags."""

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PublicationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Operation(PublicationModel):
    operation_id: str = Field(min_length=1, max_length=64)


class CreateContentDraft(Operation):
    manifest: dict

    @field_validator("manifest")
    @classmethod
    def bounded_manifest(cls, value: dict) -> dict:
        if len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode()) > 131072:
            raise ValueError("候选材料超过 128 KiB 上限")
        return value


class UpdateContentDraft(CreateContentDraft):
    expected_version: int = Field(ge=1)


class PublishContentDraft(Operation):
    expected_version: int = Field(ge=1)


class WithdrawContentRevision(Operation):
    expected_status: Literal["auto_verified"]
    reason: str = Field(min_length=3, max_length=1000)

    @field_validator("reason")
    @classmethod
    def meaningful_reason(cls, value: str) -> str:
        if len(value.strip()) < 3:
            raise ValueError("必须说明撤回原因")
        return value.strip()


class ContentDraftSummary(PublicationModel):
    id: str
    version: int
    published_revision_id: str | None
    publication_status: Literal["draft", "auto_verified", "withdrawn"]


class ContentDraftResponse(ContentDraftSummary):
    manifest: dict
    replayed: bool = False


class ContentPreflightResponse(PublicationModel):
    structural_checks: Literal["passed", "failed"]
    source_check: Literal["matched", "missing", "changed", "not_checked"]
    receipt_authentication: Literal["not_checked"] = "not_checked"
    verifier_available: bool
    issues: list[str]


class WithdrawContentResponse(PublicationModel):
    revision_id: str
    status: Literal["withdrawn"]
    replayed: bool

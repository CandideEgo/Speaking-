"""Behavior event request/response schemas (P0 behavior collection)."""

import json

from pydantic import BaseModel, Field, field_validator

from app.services.event_contract import BEHAVIOR_EVENT_SCHEMA_VERSION

# 审计 H17：事件批与单个 payload 必须有上限，否则已登录用户可以一次 POST 塞进
# 任意大的 JSONB。前端上报队列一次最多 20 条（analytics.ts MAX_QUEUE），200 给
# 10 倍余量；payload 4KB 对现有埋点（词卡点击、播放进度等小对象）远超所需。
MAX_EVENTS_PER_BATCH = 200
MAX_PAYLOAD_BYTES = 4096


class BehaviorEventRequest(BaseModel):
    """A single client-side behavior event. video_id/user_id filled by server."""

    video_id: str | None = None
    event_type: str = Field(..., max_length=32)
    event_payload: dict | None = None
    session_id: str | None = None
    client_ts: int | None = None
    # Client-generated idempotency key (A02). Optional for older clients; when
    # present, a repeat delivery is dropped before any side effect runs.
    event_id: str | None = Field(None, max_length=36)
    # A12 学习 flow 关联：与 learning_events.flow_id 同值，用于把客户端意图
    # （flow_result）与服务端学习结果对账。缺省为 None 不影响任何既有事件。
    flow_id: str | None = Field(None, max_length=36)
    # 上报契约版本。旧客户端不带 -> 按 v1 理解；服务端只接受到当前版本的上限，
    # 超出说明客户端比服务端新，拒绝而不是猜测字段含义。
    schema_version: int = Field(1, ge=1, le=BEHAVIOR_EVENT_SCHEMA_VERSION)

    @field_validator("event_payload")
    @classmethod
    def _cap_payload_size(cls, v: dict | None) -> dict | None:
        if v is not None and len(json.dumps(v, ensure_ascii=False).encode()) > MAX_PAYLOAD_BYTES:
            raise ValueError(f"event_payload exceeds {MAX_PAYLOAD_BYTES} bytes")
        return v


class BehaviorBatchRequest(BaseModel):
    """A flush of multiple events from the frontend analytics queue."""

    events: list[BehaviorEventRequest] = Field(..., max_length=MAX_EVENTS_PER_BATCH)


class BehaviorIngestResponse(BaseModel):
    ingested: int

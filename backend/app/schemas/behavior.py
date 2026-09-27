"""Behavior event request/response schemas (P0 behavior collection)."""

import json

from pydantic import BaseModel, Field, field_validator

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

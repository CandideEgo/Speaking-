import { describe, expect, it } from "vitest";

import { EVENT_SCHEMA_VERSION } from "./analytics";

/**
 * A12 契约对齐：前端只能「镜像」后端的 `BEHAVIOR_EVENT_SCHEMA_VERSION`
 * （`backend/app/services/event_contract.py`），不能 import。这里锁住版本号与
 * 字段名，任一边改契约都必须同时改两边并让测试红一次，避免静默漂移。
 */
describe("behavior event contract", () => {
  it("上报契约版本与后端一致（v2）", () => {
    expect(EVENT_SCHEMA_VERSION).toBe(2);
  });
});

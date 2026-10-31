import { describe, expect, it } from "vitest";

import {
  CLS_SESSION_GAP_MS,
  CLS_SESSION_MAX_MS,
  createVitalsState,
  recordInp,
  recordLayoutShift,
  recordLcp,
  vitalReports,
  type VitalsState,
} from "./webVitals";

function shifts(
  state: VitalsState,
  samples: Array<{ startTime: number; value: number; hadRecentInput?: boolean }>
): VitalsState {
  return samples.reduce((acc, s) => recordLayoutShift(acc, { hadRecentInput: false, ...s }), state);
}

describe("webVitals", () => {
  it("只有已有样本才上报：没有 CLS 偏移不是 0", () => {
    expect(vitalReports(createVitalsState())).toEqual([]);
  });

  it("LCP 取最后一次候选（后到的更大元素覆盖先到的）", () => {
    let state = recordLcp(createVitalsState(), 1200);
    state = recordLcp(state, 1800);
    expect(state.lcp).toBe(1800);
    expect(vitalReports(state)).toEqual([{ metric: "lcp", value: 1800 }]);
  });

  it("INP 取最长交互，且忽略非正数", () => {
    let state = recordInp(createVitalsState(), 80);
    state = recordInp(state, 240);
    state = recordInp(state, 0);
    expect(state.inp).toBe(240);
  });

  it("CLS 同一会话窗口内求和，窗口超过 5s 或间隔超过 1s 开新窗口", () => {
    // 0ms 与 900ms 同窗口（间隔 < 1s）：0.12 + 0.08 = 0.20
    let state = shifts(createVitalsState(), [
      { startTime: 0, value: 0.12 },
      { startTime: CLS_SESSION_GAP_MS - 100, value: 0.08 },
    ]);
    expect(state.clsMax).toBeCloseTo(0.2, 5);

    // 距窗口首个偏移超过 5s：新窗口，旧窗口的 0.2 保留为最大值
    state = recordLayoutShift(state, {
      startTime: CLS_SESSION_MAX_MS + 1,
      value: 0.05,
      hadRecentInput: false,
    });
    expect(state.clsMax).toBeCloseTo(0.2, 5);
    expect(state.clsWindowValue).toBeCloseTo(0.05, 5);

    // 新窗口继续累计，超过旧窗口后成为最大值
    state = recordLayoutShift(state, {
      startTime: CLS_SESSION_MAX_MS + 400,
      value: 0.3,
      hadRecentInput: false,
    });
    expect(state.clsMax).toBeCloseTo(0.35, 5);
  });

  it("用户刚有输入的偏移不计入 CLS", () => {
    const state = recordLayoutShift(createVitalsState(), {
      startTime: 100,
      value: 0.4,
      hadRecentInput: true,
    });
    expect(vitalReports(state)).toEqual([]);
  });
});

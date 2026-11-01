import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GLOSS_REPLAY_WINDOW_MS,
  glossFlowForReplay,
  matchesGlossLink,
  resetGlossLink,
  trackGlossOpen,
} from "./analytics";

/**
 * A14 主指标「查词后 10 秒内回到同一句重听」的配对规则。
 *
 * 规则本身是纯函数 `matchesGlossLink`，窗口记忆在模块级（词卡重挂载不能丢），
 * 所以这里同时测纯函数与模块级 `glossFlowForReplay`。
 */
describe("gloss_open → replay 配对", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetGlossLink();
  });

  it("窗口内且同一句 → 配对", () => {
    const at = 1_000;
    expect(matchesGlossLink({ flowId: "f", sentenceIndex: 3, at }, 3, at + 1_000)).toBe(true);
  });

  it("超出 10 秒窗口 → 不配对", () => {
    const at = 1_000;
    expect(
      matchesGlossLink({ flowId: "f", sentenceIndex: 3, at }, 3, at + GLOSS_REPLAY_WINDOW_MS + 1)
    ).toBe(false);
  });

  it("窗口边缘（正好 10 秒）仍算配对", () => {
    const at = 1_000;
    expect(
      matchesGlossLink({ flowId: "f", sentenceIndex: 3, at }, 3, at + GLOSS_REPLAY_WINDOW_MS)
    ).toBe(true);
  });

  it("不同句 → 不配对", () => {
    const at = 1_000;
    expect(matchesGlossLink({ flowId: "f", sentenceIndex: 3, at }, 4, at + 500)).toBe(false);
  });

  it("任一侧句号未知时不据此否决（宁可配对，不丢窗口边缘）", () => {
    const at = 1_000;
    expect(matchesGlossLink({ flowId: "f", sentenceIndex: null, at }, 4, at + 500)).toBe(true);
    expect(matchesGlossLink({ flowId: "f", sentenceIndex: 3, at }, null, at + 500)).toBe(true);
  });

  it("没有词卡会话 → 不配对", () => {
    expect(matchesGlossLink(null, 0, 1_000)).toBe(false);
    expect(glossFlowForReplay(0)).toBeUndefined();
  });

  it("打开词卡后的重听带上该次 flow_id，过窗后不再带", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    trackGlossOpen("video-1", "flow-abc", 2, { word: "welcome" });
    expect(glossFlowForReplay(2)).toBe("flow-abc");

    vi.setSystemTime(10_000 + GLOSS_REPLAY_WINDOW_MS + 1);
    expect(glossFlowForReplay(2)).toBeUndefined();
  });
});

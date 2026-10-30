import { describe, expect, it } from "vitest";

import {
  MAX_SEGMENT_SECONDS,
  createWatchTimeState,
  flushWatchTime,
  updateWatchTime,
  type WatchTimeReport,
  type WatchTimeState,
} from "./watchTime";

/**
 * A02 / FE-02 回归。审计复现的三个失真场景（拖动记 60 秒、循环记 0、
 * 9 秒离页记 0）在这里各有一条断言。
 *
 * 拖动之所以不再需要单独用例：累加器的输入里根本没有播放位置，只吃
 * 「播放状态 + 页面可见性 + 单调时钟」，所以位置跳变在构造上无法影响计时。
 */

function run(
  steps: Array<{ t: number; playing?: boolean; visible?: boolean; videoId?: string }>,
  initial: WatchTimeState = createWatchTimeState()
): { state: WatchTimeState; reports: WatchTimeReport[] } {
  let state = initial;
  const reports: WatchTimeReport[] = [];
  for (const step of steps) {
    const result = updateWatchTime(state, {
      videoId: step.videoId ?? "video-a",
      playing: step.playing ?? true,
      visible: step.visible ?? true,
      nowMs: step.t,
    });
    state = result.state;
    if (result.report) reports.push(result.report);
  }
  return { state, reports };
}

const ticks = (from: number, to: number, stepMs = 1000) => {
  const out: Array<{ t: number }> = [];
  for (let t = from; t <= to; t += stepMs) out.push({ t });
  return out;
};

describe("updateWatchTime", () => {
  it("按秒累计播放时间，每 10 秒上报一次", () => {
    const { reports } = run([{ t: 0 }, ...ticks(1000, 20000)]);
    expect(reports).toEqual([
      { videoId: "video-a", deltaSeconds: 10 },
      { videoId: "video-a", deltaSeconds: 10 },
    ]);
  });

  it("短片段反复重听会正常累计（旧实现记 0）", () => {
    // 5 秒的句子听 20 秒 —— 位置一直在 0~5 之间回绕，墙钟仍是 20 秒。
    const { reports } = run([{ t: 0 }, ...ticks(1000, 20000)]);
    const total = reports.reduce((sum, r) => sum + r.deltaSeconds, 0);
    expect(total).toBe(20);
  });

  it("看 9 秒就离开，尾段照样上报（旧实现记 0）", () => {
    const { state } = run([{ t: 0 }, ...ticks(1000, 9000)]);
    const flushed = flushWatchTime(state, 9000);
    expect(flushed.report).toEqual({ videoId: "video-a", deltaSeconds: 9 });
  });

  it("暂停期间不计时，暂停那一刻结算尾段", () => {
    const { state, reports } = run([
      { t: 0 },
      ...ticks(1000, 5000),
      { t: 5000, playing: false },
      // 暂停 10 秒：这 10 秒都不该进账
      ...ticks(6000, 15000).map((s) => ({ ...s, playing: false })),
      { t: 15000, playing: true },
      ...ticks(16000, 25000),
    ]);
    expect(reports).toEqual([
      { videoId: "video-a", deltaSeconds: 5 },
      { videoId: "video-a", deltaSeconds: 10 },
    ]);
    expect(state.pendingSeconds).toBe(0);
  });

  it("标签页隐藏时不计时，隐藏那一刻结算已观看的部分", () => {
    const { reports } = run([
      { t: 0 },
      ...ticks(1000, 3000),
      // 切到后台：这一秒边界的可见性按调用时刻算，隐藏之前的 3 秒要进账。
      { t: 3000, visible: false },
      // 后台停留 10 秒：一秒都不算。
      { t: 13_000, visible: false },
    ]);
    expect(reports).toEqual([{ videoId: "video-a", deltaSeconds: 3 }]);
  });

  it("换视频前会把上一个视频的尾段报掉", () => {
    const { reports } = run([
      { t: 0 },
      ...ticks(1000, 7000),
      { t: 7000, videoId: "video-b" },
      ...ticks(8000, 17000).map((s) => ({ ...s, videoId: "video-b" })),
    ]);
    expect(reports).toEqual([
      { videoId: "video-a", deltaSeconds: 7 },
      { videoId: "video-b", deltaSeconds: 10 },
    ]);
  });

  it("异常长间隔被夹到单段上限，不会一次记进几小时", () => {
    const { reports } = run([{ t: 0 }, { t: 600_000 }]);
    expect(reports).toEqual([{ videoId: "video-a", deltaSeconds: MAX_SEGMENT_SECONDS }]);
  });

  it("没有播放过时不产生任何事件", () => {
    const { reports, state } = run([
      { t: 0, playing: false },
      { t: 1000, playing: false },
    ]);
    expect(reports).toEqual([]);
    expect(flushWatchTime(state, 2000).report).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { readWatchLayout, watchSplit } from "./watchLayout";

describe("watch layout constraints", () => {
  it("stacks until both columns and the handle fit", () => {
    expect(watchSplit(823, 65)).toBeNull();
    expect(watchSplit(824, 65)?.left).toBe(480);
  });
  it("keeps both columns usable at either drag boundary", () => {
    const small = watchSplit(1000, 0)!;
    const large = watchSplit(1000, 100)!;
    expect(small.left).toBe(480);
    expect(large.available - large.left).toBeCloseTo(320);
  });
  it("uses the preferred ratio again after the container grows", () => {
    expect(watchSplit(900, 80)?.ratio).toBeLessThan(80);
    expect(watchSplit(1800, 80)?.ratio).toBe(80);
  });
  it("restores only valid local layout preferences", () => {
    expect(readWatchLayout('{"leftPanelWidth":72,"mobileFrameSize":"compact"}')).toEqual({
      leftPanelWidth: 72,
      mobileFrameSize: "compact",
    });
    for (const raw of [null, "{", "null", "false", '{"leftPanelWidth":"80"}'])
      expect(readWatchLayout(raw)).toEqual({ leftPanelWidth: 65, mobileFrameSize: "standard" });
    expect(readWatchLayout('{"leftPanelWidth":999,"mobileFrameSize":"bad"}')).toEqual({
      leftPanelWidth: 90,
      mobileFrameSize: "standard",
    });
  });
});

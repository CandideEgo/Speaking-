import { describe, expect, it } from "vitest";

import {
  MOBILE_FOLLOW_GAP,
  MOBILE_FOLLOW_TOLERANCE,
  desktopFollowOffset,
  desktopFollowScroll,
  mobileFollowScroll,
} from "@/lib/subtitleFollow";

describe("mobileFollowScroll", () => {
  const frameBottom = 200; // 画框下沿：目标落点是 208
  const target = frameBottom + MOBILE_FOLLOW_GAP;

  it("returns null when the sentence already sits at the target", () => {
    expect(mobileFollowScroll(target, frameBottom)).toBeNull();
  });

  it("tolerates a drift inside one line", () => {
    expect(mobileFollowScroll(target + MOBILE_FOLLOW_TOLERANCE, frameBottom)).toBeNull();
    expect(mobileFollowScroll(target - MOBILE_FOLLOW_TOLERANCE, frameBottom)).toBeNull();
  });

  it("scrolls by exactly the drift once past the tolerance", () => {
    expect(mobileFollowScroll(target + 40, frameBottom)).toBe(40);
    expect(mobileFollowScroll(target - 40, frameBottom)).toBe(-40);
    expect(mobileFollowScroll(target + MOBILE_FOLLOW_TOLERANCE + 1, frameBottom)).toBe(
      MOBILE_FOLLOW_TOLERANCE + 1
    );
  });
});

describe("desktopFollowScroll", () => {
  // 容器 600 高、顶边在 100；490 高的列表项居中时顶边 = 100 + (600-490)/2 = 155
  const container = { top: 100, height: 600 };
  const entryHeight = 490;
  const centeredTop = 155;

  it("returns null when the sentence is centered", () => {
    expect(desktopFollowOffset({ top: centeredTop, height: entryHeight }, container)).toBe(0);
    expect(desktopFollowScroll({ top: centeredTop, height: entryHeight }, container)).toBeNull();
  });

  it("tolerates a drift inside half a sentence", () => {
    const half = entryHeight / 2;
    expect(
      desktopFollowScroll({ top: centeredTop + half, height: entryHeight }, container)
    ).toBeNull();
  });

  it("scrolls the exact offset needed to center it", () => {
    // 当前句偏下 300px → 要往上滚 300px
    expect(desktopFollowScroll({ top: centeredTop + 300, height: entryHeight }, container)).toBe(
      300
    );
    expect(desktopFollowScroll({ top: centeredTop - 300, height: entryHeight }, container)).toBe(
      -300
    );
  });

  it("centers against the container's own height, not the entry's", () => {
    // 同一句话，容器变高 → 居中位置变，偏移也跟着变
    const tall = { top: 100, height: 800 };
    expect(desktopFollowOffset({ top: centeredTop, height: entryHeight }, tall)).toBe(-100);
  });

  it("tolerates nothing for a zero-height entry", () => {
    // 高度为 0 时「半句高」也是 0：只有正好居中才不滚（不是「一律不滚」）
    const zero = { top: container.top + container.height / 2, height: 0 };
    expect(desktopFollowScroll(zero, container)).toBeNull();
    expect(desktopFollowScroll({ top: zero.top + 1, height: 0 }, container)).toBe(1);
  });
});

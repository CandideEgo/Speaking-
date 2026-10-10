import { describe, expect, it } from "vitest";

import { displayLevel, maxLevel, shouldDisplay, wordHighlightClass } from "@/lib/examLevels";

describe("maxLevel", () => {
  it("returns the highest-order level", () => {
    expect(maxLevel(["cet4", "ielts"])).toBe("ielts");
    expect(maxLevel(["cet4"])).toBe("cet4");
  });

  it("returns null for an empty list", () => {
    expect(maxLevel([])).toBeNull();
  });
});

describe("shouldDisplay", () => {
  it("shows words whose max level reaches the target", () => {
    expect(shouldDisplay(["cet4", "ielts"], "cet4")).toBe(true);
    expect(shouldDisplay(["ielts"], "cet4")).toBe(true);
    expect(shouldDisplay(["gaoKao"], "cet4")).toBe(false);
  });
});

describe("displayLevel target priority", () => {
  it("prefers the target level when the word belongs to it", () => {
    // 选四级时，同时属于 [四级, 六级, 考研, 雅思] 的词应显示四级蓝而不是雅思红。
    expect(displayLevel(["cet4", "cet6", "ky", "ielts"], "cet4")?.key).toBe("cet4");
    expect(displayLevel(["gaoKao", "cet6"], "cet6")?.key).toBe("cet6");
  });

  it("falls back to the highest level when the word misses the target", () => {
    expect(displayLevel(["cet6", "ielts"], "cet4")?.key).toBe("ielts");
  });

  it("falls back to the highest level when no target is given", () => {
    expect(displayLevel(["cet4", "ielts"])?.key).toBe("ielts");
    expect(displayLevel(["cet4", "ielts"], null)?.key).toBe("ielts");
  });

  it("returns null for words without levels", () => {
    expect(displayLevel([], "cet4")).toBeNull();
  });
});

describe("wordHighlightClass 的四档（DEC-073）", () => {
  const BLUE_SOFT = "bg-blue-50";
  const RED_SOFT = "bg-red-50";
  const BLUE_STRONG = "bg-blue-100";
  const RED_STRONG = "bg-red-100";

  it("默认走浅底档（未收录、未掌握），且取色仍是目标分级优先", () => {
    // 选四级：词属于四级 → 蓝；只属于更高档 → 回退最高档的红。
    expect(wordHighlightClass(["cet4", "ielts"], "cet4")).toContain(BLUE_SOFT);
    expect(wordHighlightClass(["cet6", "ielts"], "cet4")).toContain(RED_SOFT);
    expect(wordHighlightClass(["cet4", "ielts"])).toContain(RED_SOFT);
  });

  it("only:true（已掌握）只留虚线下划线、一个底色都不给", () => {
    const cls = wordHighlightClass(["cet4", "ielts"], "cet4", { only: true });
    expect(cls).toContain("decoration-dotted");
    expect(cls).not.toMatch(/bg-(slate|green|blue|purple|orange|red|rose)-\d/);
  });

  it("soft:false 仍是要实底档的旧行为（留给需要最强档的调用方）", () => {
    expect(wordHighlightClass(["cet4", "ielts"], "cet4", { soft: false })).toContain(BLUE_STRONG);
    expect(wordHighlightClass(["cet6", "ielts"], "cet4", { soft: false })).toContain(RED_STRONG);
  });

  it("returns an empty string for unleveled words", () => {
    expect(wordHighlightClass([], "cet4")).toBe("");
  });
});

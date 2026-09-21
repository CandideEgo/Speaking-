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

describe("wordHighlightClass target priority", () => {
  const BLUE = "bg-blue-100";
  const RED = "bg-red-100";

  it("uses the target level color when the word belongs to it", () => {
    expect(wordHighlightClass(["cet4", "ielts"], "cet4")).toContain(BLUE);
  });

  it("falls back to the highest level color otherwise", () => {
    expect(wordHighlightClass(["cet6", "ielts"], "cet4")).toContain(RED);
    expect(wordHighlightClass(["cet4", "ielts"])).toContain(RED);
  });

  it("returns an empty string for unleveled words", () => {
    expect(wordHighlightClass([], "cet4")).toBe("");
  });
});

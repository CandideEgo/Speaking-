import { describe, expect, it } from "vitest";

import { wordHighlightClass } from "./examLevels";
import { LEARNING_WORD_CLASS, isWordSelected, wordHighlightClassFor } from "./watchWordHighlight";

const ctx = (overrides: Partial<Parameters<typeof wordHighlightClassFor>[2]> = {}) => ({
  selectedExamLevel: "cet4",
  learningWords: new Set<string>(),
  masteredWords: new Set<string>(),
  ...overrides,
});

/** 目标级别 cet4 的「未掌握」档与「已掌握」档，取自同一张等级色映射。 */
const softTier = wordHighlightClass(["cet4"], "cet4");
const underlineTier = wordHighlightClass(["cet4"], "cet4", { only: true });

describe("wordHighlightClassFor", () => {
  it("正在学的词压过其它档位，即使它也已掌握", () => {
    const cls = wordHighlightClassFor(
      "abandon",
      { abandon: ["cet4"] },
      ctx({
        learningWords: new Set(["abandon"]),
        masteredWords: new Set(["abandon"]),
      })
    );
    expect(cls).toBe(LEARNING_WORD_CLASS);
  });

  it("未收录且命中目标级别的词落到浅底 + 虚线档", () => {
    expect(wordHighlightClassFor("abandon", { abandon: ["cet4"] }, ctx())).toBe(softTier);
  });

  it("已掌握的词只留虚线下划线档，不吃底色", () => {
    const cls = wordHighlightClassFor(
      "abandon",
      { abandon: ["cet4"] },
      ctx({ masteredWords: new Set(["abandon"]) })
    );
    expect(cls).toBe(underlineTier);
    expect(cls).not.toBe(softTier);
  });

  it("低于目标级别的词不着色", () => {
    // 目标 cet6，词只属于 cet4 → 不上色。
    expect(
      wordHighlightClassFor("abandon", { abandon: ["cet4"] }, ctx({ selectedExamLevel: "cet6" }))
    ).toBe("");
  });

  it("没有目标级别、没有词级信息或标点 token 时返回空串", () => {
    expect(
      wordHighlightClassFor("abandon", { abandon: ["cet4"] }, ctx({ selectedExamLevel: null }))
    ).toBe("");
    expect(wordHighlightClassFor("abandon", null, ctx())).toBe("");
    expect(wordHighlightClassFor("——", { abandon: ["cet4"] }, ctx())).toBe("");
  });

  it("token 先归一化再查词表（大小写与标点）", () => {
    expect(wordHighlightClassFor("Abandon,", { abandon: ["cet4"] }, ctx())).toBe(softTier);
  });
});

describe("isWordSelected", () => {
  it("按归一化后的词比较，未选中时恒为 false", () => {
    expect(isWordSelected("Abandon,", "abandon")).toBe(true);
    expect(isWordSelected("abandon", null)).toBe(false);
    expect(isWordSelected("other", "abandon")).toBe(false);
  });
});

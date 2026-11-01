import { describe, expect, it } from "vitest";

import type { Subtitle } from "@/types";

import {
  isSameWordSelection,
  resolveWordSource,
  wordSourceLabel,
  wordSourcePosition,
} from "./watchWordSource";

function sub(id: string, text = "hello world"): Subtitle {
  return {
    id,
    video_id: "v1",
    sentence_index: Number(id.replace(/\D/g, "")) || 0,
    start_time: 0,
    end_time: 1,
    text_en: text,
    text_zh: null,
    grammar_note: null,
    word_levels: null,
    words: null,
    speaker: null,
  };
}

const a = sub("s1");
const b = sub("s2");
const c = sub("s3");

describe("resolveWordSource", () => {
  it("按 显式来源 → 重听句 → 词卡句 → 播放头句 的优先级取值", () => {
    expect(
      resolveWordSource({
        sourceOverride: a,
        replayTarget: b,
        wordContext: c,
        subtitles: [a, b, c],
        currentIndex: 2,
      })
    ).toBe(a);
    expect(
      resolveWordSource({ replayTarget: b, wordContext: c, subtitles: [a, b, c], currentIndex: 2 })
    ).toBe(b);
    expect(resolveWordSource({ wordContext: c, subtitles: [a, b, c], currentIndex: 2 })).toBe(c);
    expect(resolveWordSource({ subtitles: [a, b, c], currentIndex: 1 })).toBe(b);
  });

  it("越界索引、空字幕与全空候选都返回 null", () => {
    expect(resolveWordSource({ subtitles: [a], currentIndex: 9 })).toBeNull();
    expect(resolveWordSource({ subtitles: null, currentIndex: 0 })).toBeNull();
    expect(resolveWordSource({})).toBeNull();
  });
});

describe("wordSourcePosition", () => {
  it("按 id 找位置，句号从 1 起；找不到或没有来源句时为 null", () => {
    expect(wordSourcePosition([a, b, c], b)).toEqual({ index: 1, line: 2 });
    expect(wordSourcePosition([a], b)).toBeNull();
    expect(wordSourcePosition([a, b], null)).toBeNull();
    expect(wordSourcePosition(null, a)).toBeNull();
  });
});

describe("wordSourceLabel", () => {
  it("标题缺省回退到「本视频」", () => {
    expect(wordSourceLabel("标题", 2, "hello")).toBe("《标题》第 2 句 · hello");
    expect(wordSourceLabel(null, 1, null)).toBe("《本视频》第 1 句 · ");
  });
});

describe("isSameWordSelection", () => {
  it("同词同句才算重复点击；换句点同一个词要重新查询", () => {
    expect(isSameWordSelection("hello,", "hello", a, a)).toBe(true);
    expect(isSameWordSelection("hello", "hello", b, a)).toBe(false);
  });

  it("大小写按原样比较（与 useWordLookup 存下的词一致）", () => {
    expect(isSameWordSelection("Hello,", "hello", a, a)).toBe(false);
    expect(isSameWordSelection("Hello,", "Hello", a, a)).toBe(true);
  });

  it("没有选中词时永远不是重复点击", () => {
    expect(isSameWordSelection("hello", null, a, a)).toBe(false);
  });

  it("词卡与来源句都为空时，同词仍按重复点击处理（与旧实现一致）", () => {
    expect(isSameWordSelection("hello", "hello", null, null)).toBe(true);
  });
});

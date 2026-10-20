import { describe, expect, it } from "vitest";

import {
  buildTranscriptSections,
  buildWordIndex,
  countTranscriptWords,
  splitSentenceTokens,
  sectionSnippet,
} from "./transcriptDoc";
import type { Subtitle } from "@/types";

function sub(
  sentenceIndex: number,
  startTime: number,
  endTime: number,
  textEn: string,
  opts: { zh?: string; wordLevels?: Record<string, string[]> | null } = {}
): Subtitle {
  return {
    id: `s${sentenceIndex}`,
    video_id: "video",
    sentence_index: sentenceIndex,
    start_time: startTime,
    end_time: endTime,
    text_en: textEn,
    text_zh: opts.zh ?? null,
    grammar_note: null,
    word_levels: opts.wordLevels ?? null,
    speaker: null,
  };
}

describe("buildTranscriptSections", () => {
  it("keeps contiguous sentences in one section", () => {
    const sections = buildTranscriptSections([
      sub(0, 0, 3, "One."),
      sub(1, 3.5, 6, "Two."),
      sub(2, 6.4, 9, "Three."),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].index).toBe(0);
    expect(sections[0].startTime).toBe(0);
    expect(sections[0].sentences.map((s) => s.sentence_index)).toEqual([0, 1, 2]);
  });

  it("breaks on a silence longer than the gap threshold", () => {
    const sections = buildTranscriptSections([
      sub(0, 0, 3, "One."),
      sub(1, 9.2, 12, "After a pause."),
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[1].index).toBe(1);
    expect(sections[1].startTime).toBe(9.2);
  });

  it("caps section length even without pauses", () => {
    const rows = Array.from({ length: 19 }, (_, i) => sub(i, i * 3, i * 3 + 2.5, `S${i}.`));
    const sections = buildTranscriptSections(rows);
    expect(sections.map((s) => s.sentences.length)).toEqual([9, 9, 1]);
    expect(sections.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("sorts by sentence_index before grouping", () => {
    const sections = buildTranscriptSections([sub(1, 3, 6, "Second."), sub(0, 0, 3, "First.")]);
    expect(sections[0].sentences.map((s) => s.text_en)).toEqual(["First.", "Second."]);
  });

  it("returns nothing for no subtitles", () => {
    expect(buildTranscriptSections([])).toEqual([]);
  });
});

describe("buildWordIndex", () => {
  const rows = [
    sub(2, 6, 9, "The rush we feel is a habit.", {
      wordLevels: { rush: ["cet4"], habit: ["cet4"] },
    }),
    sub(0, 0, 3, "Habits, and more habits.", {
      wordLevels: { habits: ["gre"] },
    }),
    sub(1, 3, 6, "A rush again, not a habit.", {
      wordLevels: { rush: ["cet4"], habit: ["cet4"] },
    }),
  ];

  it("aggregates counts and the first occurrence", () => {
    const words = buildWordIndex(rows);
    const rush = words.find((w) => w.key === "rush");
    const habit = words.find((w) => w.key === "habit");
    expect(rush).toMatchObject({ count: 2, firstSentenceIndex: 1 });
    expect(habit).toMatchObject({ count: 2, firstSentenceIndex: 1 });
    // surface form 来自第一次出现，大小写保留、标点去掉。
    expect(words.find((w) => w.key === "habits")?.label).toBe("Habits");
  });

  it("sorts harder levels first, then frequency, then reading order", () => {
    const words = buildWordIndex(rows);
    expect(words[0].key).toBe("habits"); // gre 最难
    // 三个词计数都是 2，按首次出现排序：habits(第 0 句) → rush/habit(第 1 句)。
    expect(words.map((w) => w.key)).toEqual(["habits", "rush", "habit"]);
  });

  it("ignores words that are not exam-tagged and sentences without word_levels", () => {
    const words = buildWordIndex([
      sub(0, 0, 3, "Plain sentence.", { wordLevels: { plain: [] } }),
      sub(1, 3, 6, "No map."),
      sub(2, 6, 9, "Habit.", { wordLevels: { habit: ["cet4"] } }),
    ]);
    expect(words.map((w) => w.key)).toEqual(["habit"]);
  });

  it("returns nothing when no sentence carries word levels", () => {
    expect(buildWordIndex([sub(0, 0, 3, "Nothing here.")])).toEqual([]);
  });
});

describe("splitSentenceTokens", () => {
  const levels = { rush: ["cet4"], habit: ["gre"] };

  it("reconstructs the original sentence byte for byte", () => {
    const text = 'The rush we feel is a habit — "habits" included.';
    const tokens = splitSentenceTokens(text, levels);
    expect(tokens.map((t) => t.text).join("")).toBe(text);
  });

  it("flags only exam words, cleaning punctuation and case", () => {
    const tokens = splitSentenceTokens("Habits, and the rush.", {
      habits: ["gre"],
      rush: ["cet4"],
    });
    const flagged = tokens.filter((t) => t.levels).map((t) => [t.text, t.key, t.levels]);
    expect(flagged).toEqual([
      ["Habits,", "habits", ["gre"]],
      ["rush.", "rush", ["cet4"]],
    ]);
  });

  it("leaves everything unmarked without word levels", () => {
    expect(splitSentenceTokens("Habits and rush.", null).every((t) => t.levels === null)).toBe(
      true
    );
  });

  it("keeps whitespace as its own token", () => {
    const tokens = splitSentenceTokens("a b", null);
    expect(tokens.map((t) => t.text)).toEqual(["a", " ", "b"]);
  });
});

describe("countTranscriptWords", () => {
  it("counts words, including contractions, and skips punctuation-only tokens", () => {
    expect(
      countTranscriptWords([sub(0, 0, 3, "Don't stop — we can't."), sub(1, 3, 6, "OK.")])
    ).toBe(5);
  });
});

describe("sectionSnippet", () => {
  it("uses the first sentence and truncates with an ellipsis", () => {
    const [section] = buildTranscriptSections([
      sub(0, 0, 3, "The rush we feel is not a property of the world."),
    ]);
    expect(sectionSnippet(section, 4)).toBe("The rush we feel…");
    expect(sectionSnippet(section, 20)).toBe("The rush we feel is not a property of the world.");
  });
});

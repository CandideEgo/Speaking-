import { describe, expect, it } from "vitest";

import { selectSentenceWords } from "@/lib/sentenceWords";

const LEVELS = {
  the: ["zhongkao"],
  team: ["gaoKao"],
  works: ["cet4"],
  working: ["cet4", "cet6"],
  architecture: ["cet6"],
  distributed: ["ky"],
};

describe("selectSentenceWords", () => {
  it("keeps sentence order and only words whose max level reaches the target", () => {
    const words = selectSentenceWords(
      "The team works on a distributed architecture",
      LEVELS,
      "cet4"
    );
    expect(words.map((w) => w.key)).toEqual(["works", "distributed", "architecture"]);
  });

  it("dedupes by cleaned key", () => {
    const words = selectSentenceWords("working Working, working!", LEVELS, "cet4");
    expect(words).toHaveLength(1);
    expect(words[0]).toEqual({ key: "working", label: "working", levels: ["cet4", "cet6"] });
  });

  it("strips surrounding punctuation but preserves the surface case", () => {
    const words = selectSentenceWords("(Working) here", LEVELS, "cet4");
    expect(words[0].label).toBe("Working");
    expect(words[0].key).toBe("working");
  });

  it("returns an empty array without text, levels or a target", () => {
    expect(selectSentenceWords("", LEVELS, "cet4")).toEqual([]);
    expect(selectSentenceWords("working", null, "cet4")).toEqual([]);
    expect(selectSentenceWords("working", LEVELS, null)).toEqual([]);
  });

  it("caps the strip at the requested limit", () => {
    const words = selectSentenceWords("works working architecture distributed", LEVELS, "cet4", 2);
    expect(words.map((w) => w.key)).toEqual(["works", "working"]);
  });

  it("ignores unknown tokens and tokens without levels", () => {
    const words = selectSentenceWords("unknown working", LEVELS, "cet4");
    expect(words.map((w) => w.key)).toEqual(["working"]);
  });
});

import { describe, expect, it } from "vitest";
import type { Subtitle } from "@/types";
import { findSubtitleIndex } from "./subtitles";

function cue(start: number, end: number): Subtitle {
  return {
    id: String(start),
    video_id: "video",
    start_time: start,
    end_time: end,
    text_en: "Sentence",
    text_zh: null,
    sentence_index: start,
    grammar_note: null,
    word_levels: null,
    speaker: null,
  };
}

describe("subtitle seek boundaries", () => {
  it("selects the sentence being entered when adjacent cues share a boundary", () => {
    expect(findSubtitleIndex([cue(0, 3), cue(3, 6)], 3)).toBe(1);
  });
  it("retains the last cue at its end and excludes gaps and out-of-range times", () => {
    const subtitles = [cue(0, 3), cue(4, 6)];
    expect(findSubtitleIndex(subtitles, 6)).toBe(1);
    expect(findSubtitleIndex(subtitles, 3.5)).toBe(-1);
    expect(findSubtitleIndex(subtitles, -1)).toBe(-1);
    expect(findSubtitleIndex(subtitles, 7)).toBe(-1);
    expect(findSubtitleIndex([], 0)).toBe(-1);
  });
});

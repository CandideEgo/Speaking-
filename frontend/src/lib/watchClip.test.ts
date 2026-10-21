import { expect, it } from "vitest";
import { validWatchClip } from "./watchClip";
import type { Subtitle } from "@/types";

const cues: Subtitle[] = [
  {
    id: "a",
    video_id: "video",
    grammar_note: null,
    speaker: null,
    sentence_index: 0,
    start_time: 5,
    end_time: 8,
    text_en: "Hello",
    text_zh: null,
    word_levels: null,
  },
];
const slot = {
  content: {
    clip: { start_subtitle_id: "a", end_subtitle_id: "a", start_time: 5, end_time: 8, duration: 3 },
  },
};
it("字幕边界必须与当前已发布片段一致", () => {
  expect(validWatchClip(slot, cues, 20)).toBe(true);
  expect(validWatchClip(slot, [], 20)).toBe(false);
  expect(validWatchClip(slot, [{ ...cues[0], end_time: 9 }], 20)).toBe(false);
  expect(validWatchClip(slot, cues, 6)).toBe(false);
});

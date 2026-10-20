import { describe, expect, it } from "vitest";
import { learningStory, sampleRange } from "./homeLearning";
import type { VideoLearningMetadata } from "@/hooks/useVideoMetadata";

const sample: VideoLearningMetadata = {
  subtitle_count: 12,
  exam_word_count: 8,
  sample_text_en: "Kick. Flick. Skip. Punch. Yank.",
  sample_text_zh: "踢。弹。跳。打。拽。",
  sample_start_time: 12,
  sample_end_time: 16,
  sample_word_timestamps: [{ word: "Flick.", start: 12.8, end: 13.2 }],
};

describe("home learning stories use the real sample", () => {
  it("offers the action hook and contextual meanings only for the demonstrated sequence", () => {
    const story = learningStory("Action verbs", sample);
    expect(story.headline).toContain("英语怎么说");
    expect(story.words.map((word) => word.word)).toEqual([
      "kick",
      "flick",
      "skip",
      "punch",
      "yank",
    ]);
    expect(story.words.find((word) => word.word === "skip")?.translation).toContain("蹦跳");
    expect(learningStory("Kick. Flick. Skip. Punch. Yank.").contextual).toBe(false);
  });
  it("does not invent a hook or include a dictionary word absent from the sentence", () => {
    const story = learningStory("A real source title", {
      ...sample,
      sample_text_en: "Actually, we learn.",
      sample_text_zh: null,
      sample_words: [{ word: "act", phonetic: null, translation: "表演", levels: [] }],
    });
    expect(story.headline).toBe("A real source title");
    expect(story.words).toEqual([]);
  });
  it("uses matching quotation content for the other content hooks", () => {
    expect(
      learningStory("News", { ...sample, sample_text_en: "Literally, I do not have any words." })
        .headline
    ).toContain("不知道该说什么");
    expect(
      learningStory("Technology", {
        ...sample,
        sample_text_en: "These have billions of memory bits.",
      }).headline
    ).toContain("billions of");
  });
});

describe("home original-voice preview range", () => {
  it("uses the aligned word when present, otherwise plays the actual sample sentence", () => {
    expect(sampleRange(sample, "flick")?.start).toBe(12.8);
    expect(sampleRange(sample, "flick")?.end).toBeCloseTo(13.32, 8);
    expect(sampleRange(sample, "yank")).toEqual({ start: 12, end: 16 });
  });
  it("does not advertise a preview for missing, reversed or non-finite timestamps", () => {
    expect(sampleRange()).toBeNull();
    expect(sampleRange({ ...sample, sample_end_time: 10 })).toBeNull();
    expect(sampleRange({ ...sample, sample_start_time: Number.NaN })).toBeNull();
  });
  it("never seeks to a word alignment belonging to a different sentence", () => {
    expect(
      sampleRange(
        { ...sample, sample_word_timestamps: [{ word: "kick", start: 0, end: 1 }] },
        "kick"
      )
    ).toEqual({ start: 12, end: 16 });
  });
});

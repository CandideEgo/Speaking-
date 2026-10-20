import { describe, expect, it } from "vitest";
import {
  channelMatchesQuery,
  channelSearchText,
  directionLabels,
  formatCollectedVideos,
  formatDifficultyRange,
  latestVideoMeta,
} from "./channelLearning";
import type { ChannelSummary } from "@/types/channels";

/** 可核实字段齐全的频道（当前目录里最常见的一类）。 */
const rachel: ChannelSummary = {
  id: "channel-rachel",
  name: "Rachel's English",
  slug: "rachel-s-english",
  description: null,
  cover_url: null,
  video_count: 12,
  positioning_zh: "美式发音与口语训练",
  learning_directions: [{ id: "pronunciation", label: "发音" }],
  difficulty_range: { min: "A2", max: "B1" },
  accent_label: "美式发音",
  video_titles: ["American English Pronunciation", "How to Say the R Sound"],
  latest_video: {
    id: "video-1",
    title: "How to pronounce difficult words",
    thumbnail_url: null,
    duration: 754,
    published_at: "2026-10-01T12:00:00",
    difficulty_level: "A2",
  },
};

/** 只有基础字段的频道：所有新增字段都必须优雅降级。 */
const bare: ChannelSummary = {
  id: "channel-bare",
  name: "Some Channel",
  slug: "some-channel",
  description: "A channel without a curated profile",
  cover_url: null,
  video_count: 3,
};

describe("formatDifficultyRange", () => {
  it("formats a real CEFR range and a single level", () => {
    expect(formatDifficultyRange({ min: "A2", max: "B1" })).toBe("A2–B1");
    expect(formatDifficultyRange({ min: "B2", max: "B2" })).toBe("B2");
  });

  it("returns null when the server has no usable range", () => {
    expect(formatDifficultyRange(null)).toBeNull();
    expect(formatDifficultyRange(undefined)).toBeNull();
    expect(formatDifficultyRange({ min: "A2", max: "" })).toBeNull();
  });

  it("never invents the missing side of a dirty range", () => {
    expect(formatDifficultyRange({ min: "X1", max: "Y2" })).toBe("X1–Y2");
    expect(formatDifficultyRange({ min: "X1", max: "X1" })).toBe("X1");
  });
});

describe("formatCollectedVideos", () => {
  it("always says the count is what SeeWord collected", () => {
    expect(formatCollectedVideos(12)).toBe("本站已收录 12 段");
    expect(formatCollectedVideos(1)).toBe("本站已收录 1 段");
  });

  it("clamps negative counts instead of showing a negative number", () => {
    expect(formatCollectedVideos(0)).toBe("本站已收录 0 段");
    expect(formatCollectedVideos(-3)).toBe("本站已收录 0 段");
  });
});

describe("directionLabels", () => {
  it("maps server directions to their Chinese labels only", () => {
    expect(directionLabels(rachel.learning_directions)).toEqual(["发音"]);
    expect(directionLabels([])).toEqual([]);
    expect(directionLabels(undefined)).toEqual([]);
  });
});

describe("channel search", () => {
  it("treats an empty or whitespace query as matching everything", () => {
    expect(channelMatchesQuery(rachel, "")).toBe(true);
    expect(channelMatchesQuery(rachel, "   ")).toBe(true);
  });

  it("matches the channel name case-insensitively", () => {
    expect(channelMatchesQuery(rachel, "rachel")).toBe(true);
    expect(channelMatchesQuery(rachel, "RACHEL'S ENGLISH")).toBe(true);
  });

  it("matches the Chinese positioning and description", () => {
    expect(channelMatchesQuery(rachel, "口语")).toBe(true);
    expect(channelMatchesQuery(bare, "curated profile")).toBe(true);
  });

  it("matches the direction label and its spoken synonyms", () => {
    expect(channelMatchesQuery(rachel, "发音")).toBe(true);
    expect(channelMatchesQuery(rachel, "口音")).toBe(true);
    expect(channelMatchesQuery(rachel, "accent")).toBe(true);
    expect(channelMatchesQuery(rachel, "phonetics")).toBe(true);
  });

  it("matches real video titles, not just the channel metadata", () => {
    expect(channelMatchesQuery(rachel, "american english pronunciation")).toBe(true);
    expect(channelMatchesQuery(rachel, "r sound")).toBe(true);
    expect(channelMatchesQuery(rachel, "difficult words")).toBe(true);
  });

  it("does not match unrelated terms", () => {
    expect(channelMatchesQuery(rachel, "日语")).toBe(false);
    expect(channelMatchesQuery(bare, "发音")).toBe(false);
  });

  it("builds one lowercase search text from the real fields", () => {
    const text = channelSearchText(rachel);
    expect(text).toContain("rachel's english");
    expect(text).toContain("美式发音与口语训练");
    expect(text).toContain("pronunciation");
    expect(text).toContain("american english pronunciation");
  });
});

describe("latestVideoMeta", () => {
  it("joins the real difficulty and publish date", () => {
    expect(latestVideoMeta(rachel)).toBe("A2 · 10月1日");
  });

  it("degrades to the difficulty alone for an unparseable date", () => {
    expect(
      latestVideoMeta({
        ...rachel,
        latest_video: { ...rachel.latest_video!, published_at: "not-a-date" },
      })
    ).toBe("A2");
  });

  it("returns null when there is no latest video or no real fact to show", () => {
    expect(latestVideoMeta(bare)).toBeNull();
    expect(
      latestVideoMeta({
        ...rachel,
        latest_video: {
          id: "video-2",
          title: "Untitled",
          thumbnail_url: null,
          duration: null,
          published_at: null,
          difficulty_level: null,
        },
      })
    ).toBeNull();
  });
});

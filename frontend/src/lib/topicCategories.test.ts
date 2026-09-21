import { describe, expect, it } from "vitest";

import { TOPIC_CATEGORY_LABELS, topicLabel } from "@/lib/topicCategories";

describe("topicLabel", () => {
  it("maps canonical ids to Chinese labels", () => {
    expect(topicLabel("ted")).toBe("TED 演讲");
    expect(topicLabel("speech")).toBe("演讲");
  });

  it("is case-insensitive for legacy uppercase values", () => {
    expect(topicLabel("TED")).toBe("TED 演讲");
    expect(topicLabel(" Tech ")).toBe("科技");
  });

  it("falls back for empty values", () => {
    expect(topicLabel("")).toBe("综合");
    expect(topicLabel("   ")).toBe("综合");
    expect(topicLabel(null)).toBe("综合");
    expect(topicLabel(undefined)).toBe("综合");
  });

  it("passes through legacy free-text tags unchanged", () => {
    expect(topicLabel("TED演讲")).toBe("TED演讲");
    expect(topicLabel("科普,科技")).toBe("科普,科技");
  });
});

describe("TOPIC_CATEGORY_LABELS", () => {
  it("covers every non-all backend category id", () => {
    // 与 backend/app/services/video_classification.TOPIC_CATEGORY_IDS 保持一致。
    const backendIds = [
      "ted",
      "interview",
      "news",
      "vlog",
      "educational",
      "movie",
      "tech",
      "speech",
    ];
    for (const id of backendIds) {
      expect(TOPIC_CATEGORY_LABELS[id], `missing label for ${id}`).toBeTruthy();
    }
  });
});

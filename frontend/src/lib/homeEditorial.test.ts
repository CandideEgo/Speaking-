import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoCard } from "@/types";
import type {
  HomeEditorialContent,
  HomeEditorialExpression,
  HomeEditorialPage,
  HomeEditorialSentence,
  HomeEditorialVideoSlot,
} from "@/types/homeContent";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: apiMock }));

import {
  HOME_EDITORIAL_ENDPOINT,
  clipDurationLabel,
  clipPlayback,
  fetchHomeEditorial,
  highlightPhrase,
  mediaSource,
  normalizeHomeEditorial,
  videoDurationLabel,
  vocabularyEntry,
  vocabularyQuery,
  vocabularyRequestPath,
  wordPlayback,
} from "./homeEditorial";

function videoCard(id: string, overrides: Partial<VideoCard> = {}): VideoCard {
  return {
    id,
    title: `视频 ${id}`,
    title_zh: null,
    source_url: `https://example.com/${id}`,
    video_source: "youtube",
    thumbnail_url: null,
    duration: 754,
    difficulty_level: "B1",
    status: "ready",
    error_message: null,
    topic_tags: null,
    is_official: true,
    is_published: true,
    review_status: "published",
    rejection_reason: null,
    video_url_480p: "/media/lead.mp4",
    video_url_720p: null,
    video_url_1080p: null,
    processing_mode: null,
    processing_step: null,
    processing_progress: 100,
    like_count: 0,
    favorite_count: 0,
    view_count: 0,
    score: null,
    score_updated_at: null,
    yt_video_id: null,
    channel_name: "TED",
    description: null,
    published_at: null,
    channel_slug: null,
    channel_cover_url: null,
    upload_date: null,
    ext_view_count: null,
    ext_like_count: null,
    wpm: null,
    vocabulary_density: null,
    created_at: "2026-10-01T00:00:00Z",
    metric: null,
    note_excerpt: null,
    has_note: false,
    favorited_at: null,
    forked_from: null,
    is_demo: false,
    storage_mode: "local",
    ...overrides,
  };
}

function sentence(overrides: Partial<HomeEditorialSentence> = {}): HomeEditorialSentence {
  return {
    subtitle_id: "sub-1",
    sentence_index: 3,
    text_en: "Can you spot the difference?",
    text_zh: "你能看出区别吗？",
    start_time: 12.8,
    end_time: 15.2,
    ...overrides,
  };
}

function expression(overrides: Partial<HomeEditorialExpression> = {}): HomeEditorialExpression {
  return {
    id: "spot",
    subtitle_id: "sub-1",
    phrase: "spot",
    word: "spot",
    gloss_zh: "v. 发现；识别出",
    note_zh: "先观察，再判断。",
    phonetic: "spɒt",
    word_start_time: 13.2,
    word_end_time: 13.8,
    sentence: sentence(),
    ...overrides,
  };
}

function content(overrides: Partial<HomeEditorialContent> = {}): HomeEditorialContent {
  return {
    content_revision_id: "rev-lead",
    video_id: "lead",
    version: 1,
    headline: "一张图，能藏住多少真相？",
    dek: "听懂辨别真假的思路，也学会用英语说出识破。",
    topic_label: "图片辨真",
    source_label: "TED",
    published_at: "2026-10-19T00:00:00Z",
    clip: {
      start_subtitle_id: "sub-1",
      end_subtitle_id: "sub-2",
      start_time: 12.5,
      end_time: 54.5,
      duration: 42,
    },
    expressions: [expression()],
    interaction: null,
    scenarios: [],
    sentences: [sentence()],
    ...overrides,
  };
}

function slot(id: string, overrides: Partial<HomeEditorialVideoSlot> = {}): HomeEditorialVideoSlot {
  return {
    content: content({ video_id: id, content_revision_id: `rev-${id}` }),
    video: videoCard(id),
    ...overrides,
  };
}

function page(overrides: Partial<HomeEditorialPage> = {}): HomeEditorialPage {
  return {
    layout_revision: 4,
    published_at: "2026-10-19T00:00:00Z",
    lead: slot("lead"),
    secondary: [],
    expression: null,
    scenarios: [],
    ...overrides,
  };
}

beforeEach(() => {
  apiMock.mockReset();
});

describe("fetchHomeEditorial", () => {
  it("reads the public endpoint and returns the published page", async () => {
    apiMock.mockResolvedValueOnce({ editorial: page() });
    const result = await fetchHomeEditorial();
    expect(apiMock).toHaveBeenCalledWith(HOME_EDITORIAL_ENDPOINT, { signal: undefined });
    expect(result?.lead?.content.headline).toBe("一张图，能藏住多少真相？");
  });

  it("maps an unpublished/empty layout to null so the home page can fall back", async () => {
    apiMock.mockResolvedValueOnce({ editorial: null });
    await expect(fetchHomeEditorial()).resolves.toBeNull();
  });

  it("does not swallow request failures — the caller owns the fallback decision", async () => {
    apiMock.mockRejectedValueOnce(new Error("network down"));
    await expect(fetchHomeEditorial()).rejects.toThrow("network down");
  });
});

describe("normalizeHomeEditorial", () => {
  it("returns null when there is no usable lead", () => {
    expect(normalizeHomeEditorial(null)).toBeNull();
    expect(normalizeHomeEditorial(undefined)).toBeNull();
    expect(normalizeHomeEditorial(page({ lead: null }))).toBeNull();
  });

  it("drops secondary cards that repeat the lead video, keep order, cap at two", () => {
    const editorial = page({
      secondary: [slot("lead"), slot("second"), slot("second"), slot("third"), slot("fourth")],
    });
    const normalized = normalizeHomeEditorial(editorial);
    expect(normalized?.secondary.map((item) => item.video.id)).toEqual(["second", "third"]);
  });

  it("drops malformed scenario slots and never shows more than three", () => {
    const editorial = page({
      scenarios: [
        {
          content_revision_id: "rev-lead",
          scenario_id: "a",
          video: videoCard("lead"),
          scenario: {
            id: "a",
            situation_zh: "约朋友",
            prompt_zh: "试着回一句",
            reply_en: "Can I take a rain check?",
            reply_zh: "这次先不了。",
            sentence: null,
          },
        },
        {
          content_revision_id: "rev-lead",
          scenario_id: "b",
          video: videoCard("lead"),
          scenario: {
            id: "b",
            situation_zh: "工作沟通",
            prompt_zh: "怎么接话？",
            reply_en: "Keep me in the loop.",
            reply_zh: "随时告诉我。",
            sentence: null,
          },
        },
        {
          content_revision_id: "rev-lead",
          scenario_id: "c",
          video: videoCard("lead"),
          scenario: {
            id: "c",
            situation_zh: "下班",
            prompt_zh: "收个尾",
            reply_en: "Let's call it a day.",
            reply_zh: "今天就到这里。",
            sentence: null,
          },
        },
        {
          content_revision_id: "rev-lead",
          scenario_id: "d",
          video: videoCard("lead"),
          scenario: {
            id: "d",
            situation_zh: "多余的",
            prompt_zh: "不应出现",
            reply_en: "Extra.",
            reply_zh: "多余。",
            sentence: null,
          },
        },
      ],
    });
    expect(normalizeHomeEditorial(editorial)?.scenarios.map((item) => item.scenario.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("clip playback", () => {
  it("prefers 480p and builds the clip range from the server-resolved times", () => {
    const playback = clipPlayback(content(), videoCard("lead"));
    expect(playback).toEqual({ source: "/media/lead.mp4", start: 12.5, end: 54.5 });
  });

  it("falls back to higher qualities only when the smaller one is missing", () => {
    expect(
      mediaSource({
        video_url_480p: null,
        video_url_720p: "/media/720.mp4",
        video_url_1080p: "/media/1080.mp4",
        storage_mode: "proxy",
      })
    ).toBe("/media/720.mp4");
  });

  it("never offers a clip when the video is offline or has no local media", () => {
    const noUrls = {
      video_url_480p: null,
      video_url_720p: null,
      video_url_1080p: null,
      storage_mode: "local" as const,
    };
    expect(mediaSource(noUrls)).toBeNull();
    expect(
      mediaSource({ ...noUrls, video_url_480p: "/media/x.mp4", storage_mode: "offline" })
    ).toBe(null);
    expect(clipPlayback(content(), videoCard("lead", { storage_mode: "offline" }))).toBeNull();
    expect(clipPlayback(content(), videoCard("lead", { video_url_480p: null }))).toBeNull();
  });

  it("rejects missing, reversed or non-finite clip boundaries", () => {
    expect(clipPlayback(content({ clip: null }), videoCard("lead"))).toBeNull();
    const reversed = content({
      clip: {
        start_subtitle_id: "a",
        end_subtitle_id: "b",
        start_time: 50,
        end_time: 10,
        duration: 0,
      },
    });
    expect(clipPlayback(reversed, videoCard("lead"))).toBeNull();
    const notFinite = content({
      clip: {
        start_subtitle_id: "a",
        end_subtitle_id: "b",
        start_time: Number.NaN,
        end_time: 10,
        duration: 10,
      },
    });
    expect(clipPlayback(notFinite, videoCard("lead"))).toBeNull();
  });
});

describe("word playback", () => {
  it("uses the aligned word timestamps when they sit inside the real sentence", () => {
    expect(wordPlayback(expression())).toEqual({ start: 13.2, end: 13.8 });
  });

  it("hides the word audio when timestamps are missing, reversed or outside the sentence", () => {
    expect(wordPlayback(expression({ word_start_time: null, word_end_time: null }))).toBeNull();
    expect(wordPlayback(expression({ word_start_time: 14, word_end_time: 13 }))).toBeNull();
    expect(wordPlayback(expression({ word_start_time: 11, word_end_time: 12 }))).toBeNull();
    expect(wordPlayback(expression({ word_start_time: 15, word_end_time: 16 }))).toBeNull();
  });
});

describe("duration copy", () => {
  it("shows the real clip seconds and never a hardcoded number", () => {
    expect(clipDurationLabel(42)).toBe("42 秒");
    expect(clipDurationLabel(42.4)).toBe("42 秒");
    expect(clipDurationLabel(90)).toBe("1 分 30 秒");
    expect(clipDurationLabel(60)).toBe("1 分钟");
  });

  it("returns null instead of inventing a duration", () => {
    expect(clipDurationLabel(0)).toBeNull();
    expect(clipDurationLabel(-5)).toBeNull();
    expect(clipDurationLabel(Number.NaN)).toBeNull();
    expect(clipDurationLabel(null)).toBeNull();
    expect(videoDurationLabel(null)).toBeNull();
    expect(videoDurationLabel(0)).toBeNull();
  });

  it("shows the full video length from the real video fact", () => {
    expect(videoDurationLabel(754)).toBe("全片 12:34");
  });
});

describe("vocabulary entry", () => {
  it("reuses the existing vocabulary API with word, video, subtitle and context", () => {
    const entry = vocabularyEntry(expression(), "lead");
    expect(entry).toEqual({
      word: "spot",
      video_id: "lead",
      subtitle_id: "sub-1",
      context_sentence: "Can you spot the difference?",
    });
    const params = new URLSearchParams(vocabularyQuery(entry!));
    expect(params.get("word")).toBe("spot");
    expect(params.get("video_id")).toBe("lead");
    expect(params.get("subtitle_id")).toBe("sub-1");
    expect(params.get("context_sentence")).toBe("Can you spot the difference?");
    expect(vocabularyRequestPath(entry!)).toBe(`/api/v1/vocabulary?${vocabularyQuery(entry!)}`);
  });

  it("does not invent a word for a multi-word phrase", () => {
    expect(vocabularyEntry(expression({ word: null, phrase: "tell the difference" }), "lead")).toBe(
      null
    );
    expect(vocabularyEntry(expression({ word: "   " }), "lead")).toBeNull();
  });

  it("keeps the original sentence text as context (no added query params)", () => {
    const entry = vocabularyEntry(
      expression({ sentence: sentence({ text_en: "Spot it. Then say it." }) }),
      "lead"
    );
    const params = new URLSearchParams(vocabularyQuery(entry!));
    expect(params.get("context_sentence")).toBe("Spot it. Then say it.");
    expect(Array.from(params.keys())).toEqual([
      "word",
      "video_id",
      "subtitle_id",
      "context_sentence",
    ]);
  });
});

describe("highlightPhrase", () => {
  it("marks the first case-insensitive occurrence and keeps original casing", () => {
    expect(highlightPhrase("Can you Spot the difference?", "spot")).toEqual([
      { text: "Can you ", match: false },
      { text: "Spot", match: true },
      { text: " the difference?", match: false },
    ]);
  });

  it("handles multi-word phrases and phrases at the start/end", () => {
    expect(highlightPhrase("Tell the difference.", "tell the difference")).toEqual([
      { text: "Tell the difference", match: true },
      { text: ".", match: false },
    ]);
    expect(highlightPhrase("Spot it", "Spot")).toEqual([
      { text: "Spot", match: true },
      { text: " it", match: false },
    ]);
  });

  it("does not invent a highlight when the phrase is missing or empty", () => {
    expect(highlightPhrase("Can you see it?", "spot")).toEqual([
      { text: "Can you see it?", match: false },
    ]);
    expect(highlightPhrase("Can you see it?", null)).toEqual([
      { text: "Can you see it?", match: false },
    ]);
    expect(highlightPhrase("", "spot")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { VideoCard } from "@/types";
import type {
  HomeEditorialContent,
  HomeEditorialSentence,
  HomeEditorialVideoSlot,
} from "@/types/homeContent";
import { editorialTask, fallbackTask } from "./homeTask";

function videoCard(overrides: Partial<VideoCard> = {}): VideoCard {
  return {
    id: "lead",
    title: "How to spot a fake image",
    title_zh: null,
    source_url: "https://example.com/lead",
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

const SENTENCE: HomeEditorialSentence = {
  subtitle_id: "sub-1",
  sentence_index: 3,
  text_en: "Can you spot the difference?",
  text_zh: "你能看出区别吗？",
  start_time: 12.8,
  end_time: 15.2,
};

function content(overrides: Partial<HomeEditorialContent> = {}): HomeEditorialContent {
  return {
    content_revision_id: "rev-lead",
    video_id: "lead",
    version: 1,
    // AI 编排的标题/摘要仍在数据里，但公共任务卡不再拿它们当视频信息。
    headline: "一张图，能藏住多少真相？",
    dek: "AI 生成的摘要。",
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
    expressions: [],
    interaction: null,
    scenarios: [],
    sentences: [SENTENCE],
    ...overrides,
  };
}

function slot(overrides: Partial<HomeEditorialVideoSlot> = {}): HomeEditorialVideoSlot {
  return {
    content: content(),
    video: videoCard(),
    ...overrides,
  };
}

describe("editorialTask", () => {
  it("uses the stored Chinese title and keeps the English original as subtitle", () => {
    const task = editorialTask(slot({ video: videoCard({ title_zh: "如何识破假图片" }) }));
    expect(task.headline).toBe("如何识破假图片");
    expect(task.titleEn).toBe("How to spot a fake image");
    // AI 编排的 headline 不参与展示。
    expect(task.headline).not.toBe("一张图，能藏住多少真相？");
  });

  it("falls back to the English title without duplicating it", () => {
    const task = editorialTask(slot());
    expect(task.headline).toBe("How to spot a fake image");
    expect(task.titleEn).toBeNull();
  });

  it("ignores a blank Chinese title", () => {
    const task = editorialTask(slot({ video: videoCard({ title_zh: "   " }) }));
    expect(task.headline).toBe("How to spot a fake image");
    expect(task.titleEn).toBeNull();
  });
});

describe("fallbackTask", () => {
  it("uses the same bilingual title rules", () => {
    const task = fallbackTask(videoCard({ title_zh: "如何识破假图片" }));
    expect(task.headline).toBe("如何识破假图片");
    expect(task.titleEn).toBe("How to spot a fake image");
    expect(task.sentence).toBeNull();
  });

  it("keeps a real sample sentence and its anchor", () => {
    const task = fallbackTask(videoCard(), {
      subtitle_count: 1,
      exam_word_count: 0,
      sample_subtitle_id: "sub-1",
      sample_text_en: SENTENCE.text_en,
      sample_text_zh: SENTENCE.text_zh,
      sample_start_time: SENTENCE.start_time,
      sample_end_time: SENTENCE.end_time,
    });
    expect(task.sentence).toMatchObject({
      text_en: SENTENCE.text_en,
      start_time: SENTENCE.start_time,
      subtitle_id: "sub-1",
    });
  });
});

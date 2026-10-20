import type { SampleWord, VideoLearningMetadata } from "@/hooks/useVideoMetadata";

export interface LearningStory {
  headline: string;
  label: string;
  words: SampleWord[];
  contextual: boolean;
}

// Editorial copy is enabled only by the corresponding words in the actual
// sample, never by a video's title or its position in the recommendation feed.
const ACTIONS = [
  { word: "kick", phonetic: "kɪk", translation: "v. 踢" },
  { word: "flick", phonetic: "flɪk", translation: "v. 轻弹" },
  { word: "skip", phonetic: "skɪp", translation: "v. 蹦跳" },
  { word: "punch", phonetic: "pʌntʃ", translation: "v. 出拳；用拳击打" },
  { word: "yank", phonetic: "jæŋk", translation: "v. 猛拉；猛拽" },
];

export function learningStory(title: string, meta?: VideoLearningMetadata): LearningStory {
  const text = meta?.sample_text_en ?? "";
  const words = (meta?.sample_words ?? []).filter((word) =>
    text
      .toLowerCase()
      .match(/[a-z]+(?:['’-][a-z]+)*/g)
      ?.includes(word.word.toLowerCase())
  );
  if (/\bkick[.!]?\s+flick[.!]?\s+skip[.!]?\s+punch[.!]?\s+yank\b/i.test(text)) {
    return {
      headline: "弹一下、猛拽一下、蹦着走，英语怎么说？",
      label: "把动作说出来",
      words: ACTIONS.map((word) => ({ ...word, levels: [] })),
      contextual: true,
    };
  }
  if (/\bbillions of\b/i.test(text)) {
    return {
      headline: "新闻里的 billions of，到底是多大的数字？",
      label: "听懂数字表达",
      words,
      contextual: false,
    };
  }
  if (/\bi (?:do not|don't) have any words\b/i.test(text)) {
    return {
      headline: "「我真不知道该说什么了」，英语怎么表达？",
      label: "听懂语气与表达",
      words,
      contextual: false,
    };
  }
  const zh = meta?.sample_text_zh?.trim();
  return {
    headline:
      zh && zh.length <= 38 ? `「${zh.replace(/[。！!？?，,；;：:]$/, "")}」用英语怎么说？` : title,
    label: "从一句真实表达开始",
    words,
    contextual: false,
  };
}

export function sampleRange(meta?: VideoLearningMetadata, word?: string) {
  const sentenceStart = meta?.sample_start_time;
  const sentenceEnd = meta?.sample_end_time;
  if (
    typeof sentenceStart !== "number" ||
    typeof sentenceEnd !== "number" ||
    !Number.isFinite(sentenceStart) ||
    !Number.isFinite(sentenceEnd) ||
    sentenceStart < 0 ||
    sentenceEnd <= sentenceStart
  )
    return null;
  const stamp =
    word &&
    meta?.sample_word_timestamps?.find(
      (item) => item.word.toLowerCase().replace(/[^a-z']/g, "") === word.toLowerCase()
    );
  if (
    stamp &&
    Number.isFinite(stamp.start) &&
    Number.isFinite(stamp.end) &&
    stamp.start >= sentenceStart &&
    stamp.end > stamp.start &&
    stamp.end <= sentenceEnd
  ) {
    return { start: stamp.start, end: Math.min(stamp.end + 0.12, sentenceEnd) };
  }
  return { start: sentenceStart, end: sentenceEnd };
}

/**
 * Canonical topic-category labels (Chinese) keyed by the ids stored in
 * ``Video.topic_tags``. Single source for feed tabs (usePlatformFeed) and
 * card chips (VideoCard). Keep ids in sync with the backend taxonomy
 * ``services/video_classification.TOPIC_CATEGORIES`` — the LLM classifier
 * writes these ids, so every id must have a label here.
 */

export const TOPIC_CATEGORY_LABELS: Record<string, string> = {
  ted: "TED 演讲",
  interview: "名人访谈",
  news: "新闻",
  vlog: "生活 Vlog",
  educational: "教育学习",
  movie: "电影片段",
  tech: "科技",
  speech: "演讲",
};

/**
 * Display label for one stored topic_tags value. Canonical ids map to
 * Chinese labels; legacy free-text tags (admin-entered) pass through
 * unchanged; empty falls back to "综合".
 */
export function topicLabel(tag: string | null | undefined): string {
  const trimmed = tag?.trim();
  if (!trimmed) return "综合";
  return TOPIC_CATEGORY_LABELS[trimmed.toLowerCase()] ?? trimmed;
}

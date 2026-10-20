/**
 * 频道页共用的展示/搜索纯函数。
 *
 * 这里只做「怎么把服务端事实拼成人话」和「怎么判断一个频道是否命中搜索」，
 * 不判断频道名，也不补服务端没下发的字段。学习方向的中文标签由服务端给；
 * 这里的别名表只用于让用户用中文口语（如「发音」「口语」）也能搜到英文标题的频道。
 */

import type {
  ChannelDifficultyRange,
  ChannelLearningDirection,
  ChannelSummary,
} from "@/types/channels";

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/** 方向 id → 中文搜索别名（标签本身也参与匹配，这里只补同义说法）。 */
const DIRECTION_SEARCH_ALIASES: Record<string, string[]> = {
  pronunciation: ["发音", "口音", "pronunciation", "pronounce", "accent", "phonetics"],
  daily: ["日常", "日常对话", "对话", "口语", "conversation", "daily", "speaking", "listening"],
  interview: ["访谈", "采访", "interview", "talk show"],
  science: ["科普", "科学", "science", "explainer", "documentary"],
  speech: ["演讲", "public speaking", "speech", "talk", "ted"],
  news: ["新闻", "时政", "news", "current affairs"],
  story: ["故事", "记录", "story", "documentary", "rescue"],
  sports: ["体育", "赛事", "sports", "highlights", "wwe"],
  entertainment: ["娱乐", "脱口秀", "entertainment", "talk show", "celebrity"],
  film: ["影视", "电影", "film", "movie", "clip"],
  music: ["音乐", "music", "karaoke", "song"],
  business: ["商业", "财经", "business", "finance", "market"],
};

/** 「A2」或「A2–B1」；没有可识别难度时返回 null（不写占位区间）。 */
export function formatDifficultyRange(
  range: ChannelDifficultyRange | null | undefined
): string | null {
  if (!range?.min || !range?.max) return null;
  const min = CEFR_ORDER.find((level) => level === range.min);
  const max = CEFR_ORDER.find((level) => level === range.max);
  if (!min || !max) {
    // 服务端理论上已清洗；真遇到脏值时只显示单边，也不编造另一端。
    return range.min === range.max ? range.min : `${range.min}–${range.max}`;
  }
  return min === max ? min : `${min}–${max}`;
}

/** 「本站已收录 23 段」——明确这是本站数量，不是原频道全部视频。 */
export function formatCollectedVideos(count: number): string {
  return `本站已收录 ${Math.max(0, count)} 段`;
}

/** 学习方向的中文标签列表；服务端没给时返回空数组。 */
export function directionLabels(
  directions: ChannelLearningDirection[] | null | undefined
): string[] {
  return (directions ?? []).map((direction) => direction.label).filter(Boolean);
}

/** 频道页搜索的唯一口径：名称、中文简介/定位、学习方向、相关视频标题。 */
export function channelSearchText(channel: ChannelSummary): string {
  const directions = channel.learning_directions ?? [];
  const directionTerms = directions.flatMap((direction) => [
    direction.label,
    direction.id,
    ...(DIRECTION_SEARCH_ALIASES[direction.id] ?? []),
  ]);
  return [
    channel.name,
    channel.description,
    channel.positioning_zh,
    ...directionTerms,
    ...(channel.video_titles ?? []),
    channel.latest_video?.title,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();
}

/** 空 query 视为命中；大小写、全半角空格都归一后再比。 */
export function channelMatchesQuery(channel: ChannelSummary, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return channelSearchText(channel).includes(needle);
}

/** 最近视频的时长/难度一行文案（只拼已有事实）。 */
export function latestVideoMeta(channel: ChannelSummary): string | null {
  const video = channel.latest_video;
  if (!video) return null;
  const parts = [
    video.difficulty_level,
    video.published_at ? formatMonthDay(video.published_at) : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  return parts || null;
}

function formatMonthDay(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

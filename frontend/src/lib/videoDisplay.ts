/**
 * 视频标题的展示口径：中文为主标题，英文原名只在两者不同时作副标题。
 *
 * `title_zh` 由后端管线翻译或管理员手工维护；缺失时直接回退英文 `title`，
 * 绝不显示空串或占位符。英文副标题同样只在「中文标题 + 原文标题」确实是两个
 * 不同字符串时出现——同一句话不重复两遍。
 */

export interface VideoTitleLike {
  title: string;
  title_zh?: string | null;
}

export function videoTitleZh(video: VideoTitleLike): string {
  return video.title_zh?.trim() || video.title;
}

export function videoTitleEn(video: VideoTitleLike): string | null {
  const zh = video.title_zh?.trim();
  if (!zh || zh === video.title.trim()) return null;
  return video.title;
}

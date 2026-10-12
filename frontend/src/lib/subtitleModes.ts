/**
 * 字幕模式的唯一词表与顺序（BUG-03 / BUG-12）。
 *
 * S 键循环、桌面文稿卡头的 tablist、移动端 ⋯ 面板的语言 chip 与播放器控制条
 * 都从这里取，避免同一个概念在每个控件里各写一套文案。用户可见名里
 * "hidden" 档叫「关闭」。
 */
import type { SubtitleMode } from "@/stores/watchStore";

export const SUBTITLE_MODE_ORDER: readonly SubtitleMode[] = [
  "bilingual",
  "english",
  "chinese",
  "hidden",
];

export const SUBTITLE_MODE_LABEL: Record<SubtitleMode, string> = {
  bilingual: "双语",
  english: "英文",
  chinese: "中文",
  hidden: "关闭",
};

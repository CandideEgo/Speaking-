/**
 * 后台「首页内容」面板的纯展示格式化。
 *
 * 这里只把服务端/真实字幕给出的数值转成可读文本，**不产生任何新事实**：
 * 时间、时长、原文都必须在服务端解析或来自 `video.subtitles`。
 */

import type { HomeContentSlotPosition } from "@/types/homeContent";

/** 秒 → `M:SS.d`（字幕/片段边界用；保留一位小数便于对齐）。 */
export function formatClock(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** 服务端解析出的片段时长 → `N.N 秒`。 */
export function formatSeconds(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
  return `${seconds.toFixed(1)} 秒`;
}

/** 压成单行并截断，给下拉选项/列表里的长字幕做标签。 */
export function shortenLine(text: string, max = 48): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

/** ISO 时间 → 本地 `YYYY/MM/DD HH:mm:ss`；非法值显示占位符。 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

/** 首页位置的中文名（后台与公共页共用同一套语义）。 */
export const POSITION_LABELS: Record<HomeContentSlotPosition, string> = {
  lead: "主推",
  secondary: "次推",
  expression: "换个说法",
  scenario: "今天就能用",
};

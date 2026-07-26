/**
 * Date utility functions for relative time display and date grouping.
 */

/**
 * Format a date string as relative time in Chinese.
 * < 1min → "刚刚", < 1h → "X分钟前", < 24h → "X小时前",
 * < 7d → "X天前", otherwise → "M月D日"
 */
export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "刚刚";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;

  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * Format seconds into a human-readable Chinese duration.
 * e.g. 3660 → "1小时1分钟", 720 → "12分钟", 45 → "45秒"
 */
export function formatTimeSpent(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}小时${m}分钟`;
  if (h > 0) return `${h}小时`;
  return `${m}分钟`;
}

export interface DateGroup<T> {
  label: string;
  items: T[];
}

/**
 * Group items by date period based on a date accessor.
 * Returns groups: 今天 / 昨天 / 本周 / 更早.
 * Items within each group preserve their original order.
 */
export function groupByDate<T>(items: T[], getDate: (item: T) => string | null): DateGroup<T>[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  // "本周" = last 7 days (excluding today/yesterday which have their own groups)
  const weekStart = todayStart - 7 * 86_400_000;

  const groups: Record<string, T[]> = {
    今天: [],
    昨天: [],
    本周: [],
    更早: [],
  };

  for (const item of items) {
    const dateStr = getDate(item);
    if (!dateStr) {
      groups["更早"].push(item);
      continue;
    }
    const ts = new Date(dateStr).getTime();
    if (ts >= todayStart) {
      groups["今天"].push(item);
    } else if (ts >= yesterdayStart) {
      groups["昨天"].push(item);
    } else if (ts >= weekStart) {
      groups["本周"].push(item);
    } else {
      groups["更早"].push(item);
    }
  }

  const order = ["今天", "昨天", "本周", "更早"];
  return order
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, items: groups[label] }));
}

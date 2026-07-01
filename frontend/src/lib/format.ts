/**
 * Format a time in seconds to M:SS string (e.g. 90 → "1:30")
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format a duration in seconds to M:SS string, returning empty for null/0
 */
export function formatDuration(sec: number | null): string {
  if (!sec) return "";
  return formatTime(sec);
}

/**
 * Format a relative time string in Chinese (e.g. "刚刚", "3分钟前", "2天前")
 * Falls back to locale date for dates older than 7 days.
 */
export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  // Older than a week — show locale date
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

/**
 * Format a view count to compact string (e.g. 1.2M, 3.4K)
 */
export function formatViews(n: number | null): string {
  if (!n) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

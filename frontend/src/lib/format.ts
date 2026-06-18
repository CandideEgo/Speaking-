/**
 * Format a time in seconds to M:SS string (e.g. 90 → "1:30")
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format a duration in seconds to M:SS string, returning empty for null/0
 */
export function formatDuration(sec: number | null): string {
  if (!sec) return '';
  return formatTime(sec);
}

/**
 * Format a view count to compact string (e.g. 1.2M, 3.4K)
 */
export function formatViews(n: number | null): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

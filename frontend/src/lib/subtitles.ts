import type { Subtitle } from "@/types";

/**
 * Find the subtitle index for a given time using binary search.
 * Subtitles are assumed to be sorted by start_time.
 * Returns -1 if no subtitle contains the given time.
 */
export function findSubtitleIndex(subtitles: Subtitle[], time: number): number {
  let left = 0;
  let right = subtitles.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const s = subtitles[mid];
    if (time >= s.start_time && time <= s.end_time) {
      return mid;
    }
    if (time < s.start_time) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return -1;
}

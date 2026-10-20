import type { Subtitle } from "@/types";

/**
 * Find the subtitle index for a given time using binary search.
 * Cues are sorted by start_time and non-overlapping. At a shared end/start
 * boundary, select the new sentence so a paused seek cannot highlight the old one.
 * Returns -1 if no subtitle contains the given time.
 */
export function findSubtitleIndex(subtitles: Subtitle[], time: number): number {
  let left = 0;
  let right = subtitles.length - 1;
  let candidate = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const s = subtitles[mid];
    if (time < s.start_time) {
      right = mid - 1;
    } else {
      candidate = mid;
      left = mid + 1;
    }
  }

  return candidate !== -1 && time <= subtitles[candidate].end_time ? candidate : -1;
}

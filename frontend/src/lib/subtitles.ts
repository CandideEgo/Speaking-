import type { Subtitle } from "@/types";

/**
 * Find the subtitle index for a given time using binary search.
 * Subtitles are assumed to be sorted by start_time **and non-overlapping**:
 * the narrowing step below moves right whenever `time > s.start_time`, so with
 * overlapping cues (A=[0,10], B=[5,6], C=[7,8], time=9) a containing cue can be
 * skipped and -1 returned. Callers pass ASR-generated cues, which satisfy both.
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

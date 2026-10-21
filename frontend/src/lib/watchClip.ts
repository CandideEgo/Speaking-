import type { HomeEditorialClip } from "@/types/homeContent";
import type { Subtitle } from "@/types";
import { validInterval } from "@/lib/watchSession";

/** 发布版本已由公共接口校验指纹，再与已加载字幕核对边界，防止两次请求间字幕变化。 */
export function validWatchClip(
  slot: { content: { clip: HomeEditorialClip | null } },
  subtitles: Subtitle[],
  duration?: number | null
): boolean {
  const clip = slot.content.clip;
  if (!clip || !validInterval(clip.start_time, clip.end_time, duration)) return false;
  const first = subtitles.findIndex((s) => s.id === clip.start_subtitle_id);
  const last = subtitles.findIndex((s) => s.id === clip.end_subtitle_id);
  return (
    first >= 0 &&
    last >= first &&
    Math.abs(subtitles[first].start_time - clip.start_time) < 0.01 &&
    Math.abs(subtitles[last].end_time - clip.end_time) < 0.01
  );
}

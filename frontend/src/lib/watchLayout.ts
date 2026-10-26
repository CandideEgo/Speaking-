export const WATCH_LAYOUT_STORAGE_KEY = "seeword_watch_layout";
export const DEFAULT_WATCH_RATIO = 65;
export const MIN_VIDEO_WIDTH = 480;
export const MIN_TRANSCRIPT_WIDTH = 320;
export const WATCH_DIVIDER_WIDTH = 24;

export type MobileFrameSize = "standard" | "compact";

export function watchSplit(containerWidth: number, preferredRatio: number) {
  const available = containerWidth - WATCH_DIVIDER_WIDTH;
  if (available < MIN_VIDEO_WIDTH + MIN_TRANSCRIPT_WIDTH) return null;
  const min = (MIN_VIDEO_WIDTH / available) * 100;
  const max = ((available - MIN_TRANSCRIPT_WIDTH) / available) * 100;
  const ratio = Math.min(max, Math.max(min, preferredRatio));
  return { min, max, ratio, left: (available * ratio) / 100, available };
}

export function readWatchLayout(raw: string | null): {
  leftPanelWidth: number;
  mobileFrameSize: MobileFrameSize;
} {
  const defaults = { leftPanelWidth: DEFAULT_WATCH_RATIO, mobileFrameSize: "standard" as const };
  if (!raw) return defaults;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return defaults;
    const { leftPanelWidth, mobileFrameSize } = saved as Record<string, unknown>;
    return {
      leftPanelWidth:
        typeof leftPanelWidth === "number" && Number.isFinite(leftPanelWidth)
          ? Math.min(90, Math.max(10, leftPanelWidth))
          : DEFAULT_WATCH_RATIO,
      mobileFrameSize: mobileFrameSize === "compact" ? "compact" : "standard",
    };
  } catch {
    return defaults;
  }
}

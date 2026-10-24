"use client";

import { VideoCard, type VideoCardData } from "@/components/ui/VideoCard";
import type { WatchEntry } from "@/lib/watchEntry";

/** 发现、搜索、收藏与历史共用完整视频的信息口径。 */
export function HomeFeedCard({
  video,
  entry,
  showTopic,
  variant = "poster",
}: {
  video: VideoCardData;
  entry?: WatchEntry;
  showTopic?: boolean;
  variant?: "default" | "poster";
}) {
  return <VideoCard video={video} entry={entry} showTopic={showTopic} variant={variant} />;
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FeaturedVideoCard } from "@/components/home/FeaturedVideoCard";
import { Skeleton } from "@/components/common/SkeletonCard";
import type { VideoCard } from "@/types";

/** 公共编排不可用时展示真实精选；没有精选则直接进入视频列表。 */
export function FeaturedListening({ onSettled }: { onSettled?: () => void }) {
  const [video, setVideo] = useState<VideoCard | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    api<{ items: VideoCard[] }>("/api/v1/browse/featured?limit=6", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setVideo(data.items.find((item) => item.storage_mode !== "offline") ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          onSettled?.();
        }
      });
    return () => controller.abort();
  }, [onSettled]);
  if (loading) return <Skeleton className="h-48" />;
  return video ? <FeaturedVideoCard video={video} /> : null;
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VideoCard, VideoCardSkeleton } from "@/components/ui/VideoCard";
import { ErrorState } from "@/components/common/ErrorState";
import type { VideoCard as Video } from "@/types";

export function RelatedVideos({ videoId }: { videoId: string }) {
  const [items, setItems] = useState<Video[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setError(false);
    api<{ items: Video[] }>(`/api/v1/videos/${videoId}/related?limit=6`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setItems(data.items);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [videoId, retry]);
  if (items?.length === 0) return null;
  return (
    <section className="mt-6 border-t border-hairline pt-5" aria-label="推荐视频">
      <h2 className="mb-4 text-title font-semibold text-ink">接下来学什么</h2>
      {error ? (
        <ErrorState title="推荐暂时未能加载" onRetry={() => setRetry((n) => n + 1)} />
      ) : (
        <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
          {items
            ? items.map((video) => <VideoCard key={video.id} video={video} variant="poster" />)
            : Array.from({ length: 3 }, (_, i) => <VideoCardSkeleton key={i} />)}
        </div>
      )}
    </section>
  );
}

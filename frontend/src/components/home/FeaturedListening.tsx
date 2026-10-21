"use client";

/**
 * 没有可用首页编排时的真实兜底：从 `/browse/featured` 取一段真实视频，
 * 用同一个「今日学习任务」卡组织起来（完整视频入口、真实难度/时长/字幕预览）。
 * 不调用 AI，不硬编码视频或例句；没有视频时给出去频道找内容的真实入口。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { TodayTaskCard } from "@/components/home/TodayTaskCard";
import { useVideoMetadata } from "@/hooks/useVideoMetadata";
import { api } from "@/lib/api";
import { fallbackTask } from "@/lib/homeTask";
import type { VideoCard } from "@/types";

export function FeaturedListening({
  primary = true,
  continueVideoId,
}: {
  primary?: boolean;
  continueVideoId?: string;
}) {
  const [videos, setVideos] = useState<VideoCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    api<{ items: VideoCard[] }>("/api/v1/browse/featured?limit=6", { signal: controller.signal })
      .then((data) =>
        setVideos(data.items.filter((video) => video.storage_mode !== "offline").slice(0, 1))
      )
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [retry]);

  const metadata = useVideoMetadata(videos ?? []);

  if (failed) {
    return (
      <section
        className="rounded-md border border-hairline bg-canvas p-5"
        aria-label="今日学习任务"
      >
        <h2 className="text-title font-bold text-ink">今天的内容暂时未能加载</h2>
        <p className="mt-1 text-copy text-muted">也可以从下方的视频列表挑一段。</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setRetry((value) => value + 1)}
        >
          重新加载
        </Button>
      </section>
    );
  }

  if (!videos) {
    return (
      <div
        className="rounded-md border border-hairline bg-canvas p-4"
        aria-label="正在准备学习内容"
        role="status"
      >
        <div className="grid gap-5 md:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
          <div className="aspect-video animate-pulse rounded-sm bg-surface-card" />
          <div className="space-y-3 py-2">
            <div className="h-3 w-24 animate-pulse rounded-pill bg-surface-card" />
            <div className="h-6 w-4/5 animate-pulse rounded-pill bg-surface-card" />
            <div className="h-4 w-3/5 animate-pulse rounded-pill bg-surface-card" />
            <div className="h-9 w-40 animate-pulse rounded-sm bg-surface-card" />
          </div>
        </div>
      </div>
    );
  }

  if (!videos.length) {
    return (
      <section
        className="rounded-md border border-hairline bg-canvas p-5"
        aria-label="今日学习任务"
      >
        <h2 className="text-title font-bold text-ink">从感兴趣的话题开始</h2>
        <p className="mt-1 text-copy text-muted">精选内容准备中，先去频道找找。</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkButton href="/channels" variant="outline" size="sm">
            浏览频道
          </LinkButton>
          <Link
            href="#feed"
            className="inline-flex min-h-9 items-center text-meta text-muted hover:text-ink"
          >
            往下浏览视频
          </Link>
        </div>
      </section>
    );
  }

  const video = videos[0];
  return (
    <section aria-label="今日学习任务">
      <TodayTaskCard
        key={`feature:${video.id}`}
        task={fallbackTask(video, metadata[video.id])}
        primary={primary}
        hideCover={continueVideoId === video.id}
      />
    </section>
  );
}

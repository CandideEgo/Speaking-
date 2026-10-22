"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Image } from "@/components/ui/Image";
import { DifficultyBadge } from "@/components/video/DifficultyBadge";
import { VideoStats } from "@/components/video/VideoStats";
import { VideoTitle } from "@/components/video/VideoTitle";
import { videoLearningTheme } from "@/lib/learningBenefit";
import { formatDuration } from "@/lib/format";
import { watchHref, type WatchEntry } from "@/lib/watchEntry";
import { trackClick } from "@/lib/analytics";
import type { VideoCardData } from "@/components/ui/VideoCard";

/**
 * 首页发现流的视频卡：默认只给做决定需要的信息。
 *
 * 中文主标题 + 英文原名、主题、难度、时长与站内互动数；字幕数/词汇数/语速/
 * 长简介留在播放页。不再用通用「学习收益」替用户总结视频。
 */
export function HomeFeedCard({ video, entry }: { video: VideoCardData; entry?: WatchEntry }) {
  const videoId = String(video.id || video.video_id || "");
  const theme = videoLearningTheme(video);

  return (
    <Card
      as={Link}
      href={watchHref(videoId, entry)}
      onClick={() => trackClick(videoId, "home")}
      padding={0}
      className="group overflow-hidden"
    >
      <div className="relative aspect-video overflow-hidden rounded-sm bg-surface-card">
        <Image
          src={video.thumbnail_url}
          alt=""
          sizes="(max-width: 767px) 30vw, 20vw"
          fallback={
            <span className="absolute inset-0 grid place-items-center text-muted">
              <Play size={22} aria-hidden />
            </span>
          }
        />
        {video.difficulty_level && (
          <DifficultyBadge
            level={video.difficulty_level}
            size="sm"
            className="absolute left-2 top-2"
          />
        )}
        {video.duration != null && video.duration > 0 && (
          <span
            className="absolute bottom-2 right-2 rounded-sm px-1.5 py-0.5 font-mono text-caption font-semibold text-white"
            style={{ background: "rgba(10, 10, 10, 0.78)" }}
          >
            {formatDuration(video.duration)}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <VideoTitle
          video={video}
          zhClassName="text-copy font-semibold leading-snug tracking-tight text-ink transition-colors group-hover:text-brand-700"
        />
        <VideoStats
          likeCount={video.like_count}
          viewCount={video.view_count}
          favoriteCount={video.favorite_count}
          size="sm"
          className="mt-1.5"
        />
        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-caption text-muted">
          <span className="shrink-0 rounded-pill bg-surface-card px-2 py-0.5 font-semibold text-body">
            {theme.label}
          </span>
          {video.channel_title && (
            <span className="truncate" title={video.channel_title}>
              {video.channel_title}
            </span>
          )}
        </p>
      </div>
    </Card>
  );
}

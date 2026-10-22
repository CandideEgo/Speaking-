"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { Image } from "@/components/ui/Image";
import { LinkButton } from "@/components/ui/LinkButton";
import { VideoTitle } from "@/components/video/VideoTitle";
import { VideoDescription } from "@/components/video/VideoDescription";
import { DifficultyBadge } from "@/components/video/DifficultyBadge";
import { formatDuration } from "@/lib/format";
import { watchHref } from "@/lib/watchEntry";
import type { VideoCard } from "@/types";

/** 首页与管理端预览共用的完整视频推荐。 */
export function FeaturedVideoCard({ video, dek }: { video: VideoCard; dek?: string | null }) {
  const href = watchHref(video.id, { from: "home" });
  return (
    <article
      className="home-editorial-lead rounded-md border border-hairline bg-canvas p-4 sm:p-5"
      aria-label="精选视频"
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] md:items-center">
        <Link
          href={href}
          aria-label={`观看：${video.title_zh?.trim() || video.title}`}
          className="relative aspect-video overflow-hidden rounded-sm bg-surface-card"
        >
          <Image
            src={video.thumbnail_url}
            alt=""
            loading="eager"
            sizes="(max-width: 767px) 100vw, 42vw"
            fallback={
              <span className="absolute inset-0 grid place-items-center text-muted">
                <Play size={28} aria-hidden />
              </span>
            }
          />
          {video.duration != null && video.duration > 0 && (
            <span className="absolute bottom-2 right-2 rounded-sm bg-ink/85 px-1.5 py-0.5 font-mono text-caption text-canvas">
              {formatDuration(video.duration)}
            </span>
          )}
        </Link>
        <div className="min-w-0">
          <p className="text-meta font-semibold text-brand-700">精选视频</p>
          <VideoTitle
            video={video}
            as="h2"
            className="mt-1"
            zhClassName="text-title font-bold tracking-tight text-ink"
          />
          <VideoDescription description={video.description} dek={dek} className="mt-3" />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-meta text-muted">
            {video.channel_name &&
              (video.channel_slug ? (
                <Link href={`/channels/${video.channel_slug}`} className="hover:text-ink">
                  {video.channel_name}
                </Link>
              ) : (
                <span>{video.channel_name}</span>
              ))}
            {video.duration != null && video.duration > 0 && (
              <span>完整视频 {formatDuration(video.duration)}</span>
            )}
            {video.difficulty_level && <DifficultyBadge level={video.difficulty_level} size="sm" />}
          </div>
          <LinkButton href={href} className="mt-4" icon={Play}>
            观看完整视频
          </LinkButton>
        </div>
      </div>
    </article>
  );
}

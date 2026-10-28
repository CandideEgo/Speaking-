"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { Image } from "@/components/ui/Image";
import { DifficultyBadge } from "@/components/video/DifficultyBadge";
import { VideoMetadata } from "@/components/video/VideoMetadata";
import { VideoDescription } from "@/components/video/VideoDescription";
import { VideoTitle } from "@/components/video/VideoTitle";
import { formatDuration } from "@/lib/format";
import { watchHref } from "@/lib/watchEntry";
import type { VideoCardData } from "@/components/ui/VideoCard";

export interface ChannelVideoRowProps {
  video: VideoCardData;
  /** 频道 slug：播放页据此回到本频道。 */
  slug: string;
  /** 这一段同时是页首推荐时的小标签；不是推荐就传 null。 */
  badge?: string | null;
  /** 首屏第一行提前加载封面（Next 的 LCP 提示）。 */
  eager?: boolean;
}

/**
 * 频道内容列表的一行：缩略图 + 最多两行标题 + 难度/时长（+ 可选学习收益）。
 *
 * 用小行而不是大封面卡：频道页的主要动作是「扫一遍标题挑一段」，
 * 16:9 大卡会把首屏挤满、一屏看不到几段。标题保留完整文本（`title` 兜底），
 * 两行后省略；缺封面/缺时长/缺难度都只是少一个元素，不占位。
 */
export function ChannelVideoRow({ video, slug, badge, eager = false }: ChannelVideoRowProps) {
  const videoId = String(video.id || video.video_id || "");
  if (!videoId) return null;

  const duration =
    video.duration != null && video.duration > 0 ? formatDuration(video.duration) : null;

  return (
    <Link
      href={watchHref(videoId, { from: "channel", extra: { slug } })}
      title={video.title}
      className="group flex items-start gap-3 rounded-md px-2 py-3 transition-colors hover:bg-surface-soft"
    >
      <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-sm bg-surface-card sm:w-36">
        <Image
          src={video.thumbnail_url}
          alt=""
          sizes="(max-width: 639px) 112px, 144px"
          loading={eager ? "eager" : "lazy"}
          fallback={
            <span className="absolute inset-0 flex items-center justify-center">
              <Play size={18} className="text-muted" aria-hidden />
            </span>
          }
        />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <VideoTitle
          video={video}
          as="span"
          zhClassName="break-words text-copy font-semibold leading-snug text-ink transition-colors group-hover:text-brand-700"
        />
        <VideoDescription description={video.description} />
        <VideoMetadata video={video} />
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
          <DifficultyBadge level={video.difficulty_level} size="sm" />
          {duration && <span className="tabular-nums">{duration}</span>}
          {badge && (
            <span className="rounded-pill bg-brand-50 px-2 py-0.5 text-caption font-semibold text-brand-700">
              {badge}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}

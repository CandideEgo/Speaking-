"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { Image } from "@/components/ui/Image";
import { cn } from "@/lib/utils";
import { trackClick } from "@/lib/analytics";

/** Minimal video data needed by VideoCard. Works with both Video and VideoItem. */
export interface VideoCardData {
  id?: string; // optional for VideoItem
  video_id?: string; // VideoItem uses this as primary key
  title: string;
  thumbnail_url: string | null;
  duration: number | null;
  difficulty_level?: string | null;
  topic_tags?: string | null;
  channel_title?: string;
}

export interface VideoCardProps {
  /** Video data. */
  video: VideoCardData;
  /** Featured (hero-sized) variant. */
  feat?: boolean;
  /** Watch progress percentage (0-100). Shown only in feat mode. */
  progress?: number;
  /** Label shown in the duration badge (bottom-right of thumbnail). Overrides duration display. */
  durationLabel?: string;
  /** Custom footer content. Replaces the default channel + category footer. */
  footer?: ReactNode;
  /** Additional className for the outer link. */
  className?: string;
}

function clickSource(): string {
  if (typeof window === "undefined") return "unknown";
  const p = window.location.pathname;
  if (p === "/" || p === "") return "home";
  if (p.startsWith("/browse")) return "browse";
  if (p.startsWith("/search")) return "search";
  if (p.startsWith("/vocabulary")) return "vocabulary";
  if (p.startsWith("/community")) return "community";
  return "other";
}

export function VideoCard({
  video,
  feat = false,
  progress,
  durationLabel,
  footer,
  className,
}: VideoCardProps) {
  const category = video.topic_tags?.split(",")[0]?.trim() || "综合";
  const videoId = String(video.id || video.video_id || "");

  return (
    <Link
      href={`/watch/${video.id || video.video_id}`}
      onClick={() => trackClick(videoId, clickSource())}
      className={cn(
        "bg-canvas border border-hairline rounded-lg overflow-hidden cursor-pointer hover:-translate-y-1 hover:shadow-lift hover:border-transparent transition-all duration-150 group",
        className,
      )}
    >
      {/* Thumbnail */}
      <div
        className={cn(
          "relative aspect-video bg-surface-card overflow-hidden",
          feat && "aspect-[16/10]",
        )}
      >
        <Image
          src={video.thumbnail_url}
          alt=""
          fill
          fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <Play size={32} className="text-muted-soft" />
            </div>
          }
        />
        {video.difficulty_level && (
          <span
            className="absolute left-2 top-2 backdrop-blur-sm text-[11px] font-bold text-ink px-2 py-1 rounded-pill"
            style={{ background: "rgba(255, 255, 255, 0.92)" }}
          >
            {video.difficulty_level}
          </span>
        )}
        {/* Duration badge */}
        {durationLabel ? (
          <span
            className="absolute right-2 bottom-2 text-white text-[11px] font-semibold font-mono px-1.5 py-0.5 rounded-[5px]"
            style={{ background: "rgba(10, 10, 10, 0.78)" }}
          >
            {durationLabel}
          </span>
        ) : (
          video.duration != null &&
          video.duration > 0 && (
            <span
              className="absolute right-2 bottom-2 text-white text-[11px] font-semibold font-mono px-1.5 py-0.5 rounded-[5px]"
              style={{ background: "rgba(10, 10, 10, 0.78)" }}
            >
              {formatDuration(video.duration)}
            </span>
          )
        )}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{ background: "rgba(10, 10, 10, 0.32)" }}
        >
          <div className="w-12 h-12 rounded-full bg-brand-500 flex items-center justify-center shadow-brand scale-[0.9] group-hover:scale-100 transition-transform duration-150">
            <Play size={20} fill="#fff" className="text-white ml-0.5" />
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="p-3.5">
        <p
          className={cn(
            "text-sm font-semibold leading-snug text-ink line-clamp-2 mb-2 tracking-tight",
            feat && "text-lg min-h-[50px]",
          )}
        >
          {video.title}
        </p>
        {footer ?? (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>{video.channel_title || "Speaking"}</span>
            <span className="w-[3px] h-[3px] rounded-full bg-muted-soft" />
            <span className="text-[11px] font-semibold text-body bg-surface-card px-2 py-0.5 rounded-pill">
              {category}
            </span>
            {feat && progress !== undefined && (
              <>
                <span className="w-[3px] h-[3px] rounded-full bg-muted-soft" />
                <span className="text-[11px] font-semibold font-mono text-brand-500">
                  {progress}% 已观看
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

/** Skeleton placeholder for loading states. */
export function VideoCardSkeleton() {
  return (
    <div className="bg-canvas border border-hairline rounded-lg overflow-hidden animate-pulse">
      <div className="relative aspect-video bg-surface-card" />
      <div className="p-3.5">
        <div className="h-4 bg-surface-card rounded w-3/4 mb-2" />
        <div className="h-3 bg-surface-card rounded w-1/2" />
      </div>
    </div>
  );
}

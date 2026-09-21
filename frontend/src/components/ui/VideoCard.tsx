"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Eye, Play } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { Image } from "@/components/ui/Image";
import { DifficultyBadge } from "@/components/video/DifficultyBadge";
import { cn, formatCount } from "@/lib/utils";
import { trackClick } from "@/lib/analytics";
import { topicLabel } from "@/lib/topicCategories";

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
  /** 作者页 slug（ADR-0014 修订）：非空时频道名可点跳转。 */
  channel_slug?: string | null;
  is_demo?: boolean;
  /** 内容三态（需求 §5.1）：offline 时卡片显示「已下架」角标。 */
  storage_mode?: string | null;
  /** 站内总播放量（complete 计数，区别于 YouTube 侧 ext_view_count）。 */
  view_count?: number | null;
  /** 站内总收藏数。 */
  favorite_count?: number | null;
  /** 视频简介（列表接口已截断到 200 字符）；本地视频可能为 null。 */
  description?: string | null;
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
  const router = useRouter();
  // topic_tags 存 canonical id（LLM 分类产出），展示时映射为中文标签；
  // 空/历史自由文本走 topicLabel 的兜底。
  const category = topicLabel(video.topic_tags?.split(",")[0]);
  const videoId = String(video.id || video.video_id || "");

  // 频道名跳作者页：外层卡片是 <Link>，不能嵌套 <a>，用受控 span 拦截冒泡。
  // 未挂频道的视频（channel_slug 为空）保持纯文本。
  const channelLink = video.channel_slug ? `/channels/${video.channel_slug}` : null;

  function onChannelClick(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (channelLink) router.push(channelLink);
  }

  return (
    <Link
      href={`/watch/${video.id || video.video_id}`}
      onClick={() => trackClick(videoId, clickSource())}
      className={cn(
        "bg-canvas border border-hairline rounded-xl overflow-hidden cursor-pointer",
        "hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/[0.08] hover:border-transparent",
        "transition-all duration-200 ease-out group",
        className
      )}
    >
      {/* Thumbnail */}
      <div
        className={cn(
          "relative aspect-video bg-surface-card overflow-hidden",
          feat && "aspect-[16/10]"
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
          <DifficultyBadge
            level={video.difficulty_level}
            size="sm"
            className="absolute left-2 top-2 backdrop-blur-sm"
            style={{ background: "rgba(255, 255, 255, 0.92)" }}
          />
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
        {/* 已下线标注（需求 §5.3）：收藏夹保留入口，但明确告知不可播。 */}
        {video.storage_mode === "offline" && (
          <span className="absolute left-2 bottom-2 inline-flex items-center rounded-pill bg-ink/85 px-2 py-0.5 text-[11px] font-semibold text-canvas backdrop-blur-sm">
            已下架
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="p-4">
        <p
          className={cn(
            "text-sm font-semibold leading-snug text-ink line-clamp-2 mb-2 tracking-tight group-hover:text-brand-600 transition-colors duration-150",
            feat && "text-lg min-h-[50px]"
          )}
        >
          {video.title}
        </p>
        {/* 简介：YouTube 侧描述（列表已截断），最多两行，帮用户判断内容。 */}
        {video.description && (
          <p className="text-xs leading-relaxed text-muted line-clamp-2 mb-2">
            {video.description}
          </p>
        )}
        {/* 站内总播放 / 收藏（需求 §3.3）：独立一行，自定义 footer 时也保留。 */}
        {(video.view_count != null || video.favorite_count != null) && (
          <div className="flex items-center gap-3 text-[11px] text-muted mb-2.5">
            {video.view_count != null && (
              <span className="inline-flex items-center gap-1" title="播放量">
                <Eye size={13} className="text-muted-soft" />
                {formatCount(Number(video.view_count))}
              </span>
            )}
            {video.favorite_count != null && (
              <span className="inline-flex items-center gap-1" title="收藏数">
                <Bookmark size={12} className="text-muted-soft" />
                {formatCount(Number(video.favorite_count))}
              </span>
            )}
          </div>
        )}
        {footer ?? (
          <div className="flex items-center gap-2 text-xs text-muted">
            {channelLink ? (
              <span
                role="link"
                tabIndex={0}
                onClick={onChannelClick}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onChannelClick(e);
                }}
                className="hover:text-ink transition-colors cursor-pointer truncate max-w-[9rem]"
                title={video.channel_title}
              >
                {video.channel_title || "SeeWord"}
              </span>
            ) : (
              <span>{video.channel_title || "SeeWord"}</span>
            )}
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
    <div className="bg-canvas border border-hairline rounded-xl overflow-hidden animate-pulse">
      <div className="relative aspect-video bg-surface-card" />
      <div className="p-4">
        <div className="h-4 bg-surface-card rounded-md w-3/4 mb-2.5" />
        <div className="h-3 bg-surface-card rounded-md w-1/2" />
      </div>
    </div>
  );
}

"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, ChevronDown, Eye, Heart, Play } from "lucide-react";
import { Image } from "@/components/ui/Image";
import { LinkButton } from "@/components/ui/LinkButton";
import { formatDuration } from "@/lib/format";
import { watchHref } from "@/lib/watchEntry";
import { cn, formatCount } from "@/lib/utils";
import type { VideoCard } from "@/types";

/** 所有视频共用的首页展示：元信息即可观看，教学内容按需展开。 */
export function HomeVideoFeature({
  video,
  headline = video.title,
  description,
  topic,
  source = video.channel_name,
  editorialHeadline,
  className,
  coverClassName,
  coverControls,
  preview,
  notice,
}: {
  video: VideoCard;
  headline?: string;
  description?: string | null;
  topic?: string | null;
  source?: string | null;
  editorialHeadline?: string | null;
  className?: string;
  coverClassName?: string;
  coverControls?: ReactNode;
  preview?: ReactNode;
  notice?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const previewId = useId();
  const href = watchHref(video.id, { from: "home" });
  return (
    <article className={cn("home-feature-card", className)} aria-label={headline}>
      <div className={cn("home-feature-cover", coverClassName)}>
        <Image
          src={video.thumbnail_url}
          alt={video.title}
          fill
          loading="eager"
          fallback={
            <span className="home-feature-no-cover">
              <Play size={26} aria-hidden />
            </span>
          }
        />
        {video.duration != null && video.duration > 0 && (
          <span className="home-feature-duration">{formatDuration(video.duration)}</span>
        )}
        {coverControls ?? (
          <Link href={href} className="home-cover-play" aria-label="去原视频学习">
            <Play size={20} fill="currentColor" aria-hidden />
          </Link>
        )}
      </div>
      <div className="home-feature-copy">
        <div className="home-feature-meta">
          {source && <span className="home-feature-source">{source}</span>}
          {topic && <span>{topic}</span>}
          {video.difficulty_level && <span>{video.difficulty_level}</span>}
        </div>
        <h3 className="home-feature-title">
          <Link href={href} title={headline}>
            {headline}
          </Link>
        </h3>
        {editorialHeadline && editorialHeadline !== video.title && (
          <p className="home-feature-editorial-headline">本期看点：{editorialHeadline}</p>
        )}
        {description && <p className="home-feature-description">{description}</p>}
        <div className="home-feature-stats" aria-label="视频互动数据">
          <span title="点赞数">
            <Heart size={14} aria-hidden />
            {formatCount(video.like_count)}
          </span>
          <span title="收藏数">
            <Bookmark size={14} aria-hidden />
            {formatCount(video.favorite_count)}
          </span>
          <span title="站内播放数">
            <Eye size={14} aria-hidden />
            {formatCount(video.view_count)}
          </span>
        </div>
        <div className="home-feature-actions">
          <LinkButton href={href} variant="primary" size="sm" icon={ArrowUpRight}>
            开始观看
          </LinkButton>
          {preview && (
            <button
              type="button"
              className="home-feature-preview-toggle"
              aria-expanded={expanded}
              aria-controls={previewId}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "收起预览" : "学前预览"}
              <ChevronDown
                size={14}
                aria-hidden
                className={cn("home-editorial-chevron", expanded && "is-open")}
              />
            </button>
          )}
        </div>
      </div>
      {preview && expanded && (
        <div id={previewId} className="home-feature-preview">
          {preview}
        </div>
      )}
      {notice && <div className="home-feature-notice">{notice}</div>}
    </article>
  );
}

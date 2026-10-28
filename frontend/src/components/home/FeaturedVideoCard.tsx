"use client";

import Link from "next/link";
import { ArrowUpRight, Bookmark, Heart, Play } from "lucide-react";
import { Image } from "@/components/ui/Image";
import { LinkButton } from "@/components/ui/LinkButton";
import { DifficultyBadge } from "@/components/video/DifficultyBadge";
import { formatCount, formatDuration } from "@/lib/format";
import { watchHref } from "@/lib/watchEntry";
import type { HomeEditorialContent } from "@/types/homeContent";
import type { VideoCard } from "@/types";

/**
 * 首页主推卡：媒体在左、编辑内容在右。
 *
 * 有已发布编排（`content`）时展示真实字幕原句作为引文；没有编排时（发现页旧
 * 兜底）只展示视频事实与简介，绝不编造原句。
 */
export function FeaturedVideoCard({
  video,
  content,
}: {
  video: VideoCard;
  dek?: string | null;
  content?: HomeEditorialContent | null;
}) {
  const href = watchHref(video.id, { from: "home" });
  const quote = content?.expressions.find((expression) => expression.sentence)?.sentence ?? null;
  // 设计稿首页主 CTA 直接落在引文那一句（?t=），而不是从 0 开始播。
  const quoteStart = quote ? Math.floor(quote.start_time) : null;
  const startHref =
    quoteStart != null ? watchHref(video.id, { from: "home", extra: { t: quoteStart } }) : href;

  const channelHref = video.channel_slug ? `/channels/${video.channel_slug}` : null;

  return (
    <article
      className="home-editorial-lead discover-feature overflow-hidden rounded-lg border border-hairline bg-canvas"
      aria-label="精选视频"
    >
      <div className="discover-feature-grid">
        <Link
          href={href}
          aria-label={`观看：${video.title_zh?.trim() || video.title}`}
          className="discover-feature-cover group relative aspect-video overflow-hidden bg-surface-card"
        >
          <Image
            src={video.thumbnail_url}
            alt=""
            loading="eager"
            sizes="(max-width: 767px) 100vw, 50vw"
            imgClassName="object-cover"
            fallback={
              <span className="absolute inset-0 grid place-items-center text-muted">
                <Play size={28} aria-hidden />
              </span>
            }
          />
          <span className="discover-feature-play" aria-hidden>
            <Play size={22} fill="currentColor" />
          </span>
          {video.duration != null && video.duration > 0 && (
            <span className="absolute right-2 bottom-2 rounded-sm bg-ink/85 px-1.5 py-0.5 font-mono text-caption text-canvas">
              {formatDuration(video.duration)}
            </span>
          )}
        </Link>

        <div className="discover-feature-copy flex min-w-0 flex-col justify-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 items-center gap-1.5 text-caption font-semibold text-brand-700">
              <span className="h-1.5 w-1.5 rounded-full bg-action-primary" aria-hidden />
              今日精选
            </span>
            {video.difficulty_level && <DifficultyBadge level={video.difficulty_level} size="sm" />}
          </div>

          <h2
            lang="en"
            className="discover-feature-title text-balance font-semibold tracking-tight text-ink"
          >
            {video.title}
          </h2>
          {video.title_zh && (
            <p className="line-clamp-1 text-meta font-medium text-muted">
              {video.title_zh}
              {video.channel_name ? ` · ${video.channel_name}` : ""}
            </p>
          )}

          {quote ? (
            <blockquote className="border-l-2 border-brand-500 pl-3 text-copy leading-relaxed text-body">
              <span lang="en" className="line-clamp-2">
                “{quote.text_en}”
              </span>
              {quote.text_zh && (
                <span className="mt-1 block line-clamp-1 text-meta text-muted">
                  {quote.text_zh}
                </span>
              )}
            </blockquote>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta text-muted">
            {video.channel_name &&
              (channelHref ? (
                <Link href={channelHref} className="font-semibold text-ink hover:text-brand-700">
                  {video.channel_name}
                </Link>
              ) : (
                <span className="font-semibold text-ink">{video.channel_name}</span>
              ))}
            {content?.sentences?.length ? (
              <span className="whitespace-nowrap">
                <span aria-hidden className="text-hairline-strong">
                  ·{" "}
                </span>
                {content.sentences.length} 句逐句字幕
              </span>
            ) : null}
            {content?.topic_label && (
              <span className="whitespace-nowrap">
                <span aria-hidden className="text-hairline-strong">
                  ·{" "}
                </span>
                {content.topic_label}
              </span>
            )}
            {/* 设计 hero 元信息是「句数 · 主题 · 点赞 · 收藏」，不展示发布/播放量（V-12）。 */}
            {video.like_count != null && (
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap"
                title="本站点赞数"
                aria-label={`点赞 ${formatCount(video.like_count)}`}
              >
                <span aria-hidden className="text-hairline-strong">
                  ·
                </span>
                <Heart size={12} aria-hidden />
                {formatCount(video.like_count)}
              </span>
            )}
            {video.favorite_count != null && (
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap"
                title="本站收藏数"
                aria-label={`收藏 ${formatCount(video.favorite_count)}`}
              >
                <Bookmark size={12} aria-hidden />
                {formatCount(video.favorite_count)}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <LinkButton href={startHref} icon={Play}>
              {quote ? "从这句话开始" : "观看完整视频"}
            </LinkButton>
            {channelHref && (
              <LinkButton href={channelHref} variant="text" icon={ArrowUpRight} iconRight size="sm">
                看频道
              </LinkButton>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

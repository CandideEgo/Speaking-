"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { Image } from "@/components/ui/Image";
import { LinkButton } from "@/components/ui/LinkButton";
import { VideoMetadata } from "@/components/video/VideoMetadata";
import { DifficultyBadge } from "@/components/video/DifficultyBadge";
import { formatDuration } from "@/lib/format";
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
      className="home-editorial-lead overflow-hidden rounded-lg border border-hairline bg-canvas"
      aria-label="精选视频"
    >
      <div className="grid md:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)]">
        <Link
          href={href}
          aria-label={`观看：${video.title_zh?.trim() || video.title}`}
          className="relative aspect-video overflow-hidden bg-surface-card md:aspect-auto md:min-h-[290px]"
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
          {video.duration != null && video.duration > 0 && (
            <span className="absolute right-2 bottom-2 rounded-sm bg-ink/85 px-1.5 py-0.5 font-mono text-caption text-canvas">
              {formatDuration(video.duration)}
            </span>
          )}
        </Link>

        <div className="flex min-w-0 flex-col justify-center gap-2.5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-sm bg-ink px-2 text-caption font-semibold text-canvas">
              今日精选
            </span>
            {video.difficulty_level && <DifficultyBadge level={video.difficulty_level} size="sm" />}
            {video.duration != null && video.duration > 0 && (
              <span className="text-caption tabular-nums text-muted">
                {formatDuration(video.duration)}
              </span>
            )}
          </div>

          <h2
            lang="en"
            className="text-balance text-title font-semibold leading-[1.12] tracking-tight text-ink sm:text-display"
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
          </div>

          <VideoMetadata video={video} />

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <LinkButton href={startHref} icon={Play}>
              {quote ? "从这句话开始" : "观看完整视频"}
            </LinkButton>
            {channelHref && (
              <LinkButton href={channelHref} variant="outline">
                看频道
              </LinkButton>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

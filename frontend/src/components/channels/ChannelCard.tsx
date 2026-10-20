"use client";

import Link from "next/link";
import { ArrowRight, Check, Play } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Card } from "@/components/ui/Card";
import { Image } from "@/components/ui/Image";
import { userInitial } from "@/lib/avatar";
import {
  directionLabels,
  formatCollectedVideos,
  formatDifficultyRange,
  latestVideoMeta,
} from "@/lib/channelLearning";
import { formatDuration } from "@/lib/format";
import { watchHref } from "@/lib/watchEntry";
import type { ChannelSummary } from "@/types/channels";

/**
 * 频道目录卡片。
 *
 * 卡片先回答「这是谁（头像/名称）、教什么（中文定位/学习方向）、本站内容多难、
 * 收了多少」，最近一条视频只作为「可以先点开一段」的辅助信息。列表页的目标是
 * 挑一个能长期跟学的来源，所以不做大封面、不做营销大图；头像用圆形、视频缩略图
 * 用 16:9，两种形状一眼能分开。
 *
 * 服务端没给依据的字段（定位/口音/难度/最近视频）直接不渲染——不写占位假值。
 */
export function ChannelCard({
  channel,
  subscribed = false,
}: {
  channel: ChannelSummary;
  subscribed?: boolean;
}) {
  const latest = channel.latest_video;
  // 服务端的 cover_url 在没有真实频道图时会回退成最新视频缩略图；那种图套进
  // 圆形头像就是视频画面被裁一刀，还和下面的缩略图重复。没有独立头像时用首字母。
  const avatarUrl =
    channel.cover_url && channel.cover_url !== latest?.thumbnail_url ? channel.cover_url : null;
  const intro = channel.positioning_zh || channel.description;
  const directions = directionLabels(channel.learning_directions);
  const difficulty = formatDifficultyRange(channel.difficulty_range);
  // 「本站已收录 N 段」是本站事实；不写成原频道的全部视频数。
  const facts = [
    difficulty ? `难度 ${difficulty}` : null,
    channel.accent_label || null,
    formatCollectedVideos(channel.video_count),
  ].filter((fact): fact is string => Boolean(fact));
  const latestFacts = [
    latest?.duration != null ? formatDuration(latest.duration) : null,
    latestVideoMeta(channel),
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <Card
      as="article"
      padding={0}
      className="group flex h-full min-w-0 flex-col overflow-hidden transition-colors hover:border-hairline-strong"
    >
      <div className="flex min-w-0 items-start gap-3 p-4">
        <Link
          href={`/channels/${channel.slug}`}
          tabIndex={-1}
          aria-hidden
          className="relative h-11 w-11 shrink-0 overflow-hidden rounded-pill border border-hairline bg-surface-card"
        >
          {avatarUrl ? (
            <Image src={avatarUrl} alt="" sizes="44px" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-copy font-bold text-muted">
              {userInitial(channel.name)}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 text-copy-lg font-bold leading-snug text-ink">
              <Link
                href={`/channels/${channel.slug}`}
                title={channel.name}
                className="line-clamp-2 transition-colors hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                {channel.name}
              </Link>
            </h2>
            {subscribed && (
              <Badge tone="brand" icon={Check} className="shrink-0">
                已订阅
              </Badge>
            )}
          </div>
          {intro && (
            <p className="mt-1 line-clamp-2 text-meta leading-relaxed text-body" title={intro}>
              {intro}
            </p>
          )}
        </div>
      </div>

      {directions.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-4" aria-label="学习方向">
          {directions.map((label) => (
            <li
              key={label}
              className="inline-flex h-6 items-center rounded-pill border border-hairline bg-surface-soft px-2 text-caption text-body"
            >
              {label}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 px-4 text-meta tabular-nums text-muted">{facts.join(" · ")}</p>

      <div className="mt-auto pt-3">
        {latest && (
          <Link
            href={watchHref(latest.id, { from: "channel", extra: { slug: channel.slug } })}
            className="flex items-start gap-3 border-t border-hairline bg-surface-soft p-3 transition-colors hover:bg-surface-card focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500"
          >
            <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-sm bg-surface-card">
              {latest.thumbnail_url ? (
                <Image src={latest.thumbnail_url} alt="" sizes="80px" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-muted">
                  <Play size={14} aria-hidden />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-caption font-semibold text-muted">最近收录</p>
              <p
                className="mt-0.5 line-clamp-2 text-meta font-medium leading-snug text-ink"
                title={latest.title}
              >
                {latest.title}
              </p>
              {latestFacts.length > 0 && (
                <p className="mt-1 text-caption tabular-nums text-muted">
                  {latestFacts.join(" · ")}
                </p>
              )}
            </div>
          </Link>
        )}

        <div className="flex items-center justify-end border-t border-hairline px-4 py-2.5">
          <Link
            href={`/channels/${channel.slug}`}
            className="inline-flex items-center gap-1 text-meta font-semibold text-body transition-colors group-hover:text-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            进入频道
            <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      </div>
    </Card>
  );
}

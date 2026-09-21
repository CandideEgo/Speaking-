"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { cn, formatCount, relativeTime } from "@/lib/utils";
import type { RankingRowMode } from "@/components/rankings/RankingRow";
import type { RankedVideo } from "@/types";

/** 名次配色：1 品牌橙 / 2 琥珀 / 3 深橙（暗色下提亮）。 */
function rankClass(rank: number): string {
  if (rank === 1) return "text-brand-500";
  if (rank === 2) return "text-accent-amber";
  return "text-brand-700";
}

/** 榜单指标块：微标签 + 数值；time 模式显示 NEW 标签 + 相对时间。 */
function PodiumMetric({
  video,
  mode,
  metricLabel,
  big,
  accent,
}: {
  video: RankedVideo;
  mode: RankingRowMode;
  metricLabel: string;
  big: boolean;
  accent: boolean;
}) {
  if (mode === "time") {
    return (
      <div>
        <span className="inline-block rounded-sm bg-brand-50 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.12em] text-brand-600">
          NEW
        </span>
        <p className={cn("mt-1 tabular-nums text-muted", big ? "text-sm" : "text-[11px]")}>
          {relativeTime(video.published_at ?? video.created_at)}
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-soft">
        {metricLabel}
      </p>
      <p
        className={cn(
          "font-display font-extrabold tabular-nums tracking-display-sm",
          big ? "text-2xl sm:text-3xl" : "text-lg",
          accent ? "text-brand-500" : "text-ink"
        )}
      >
        {formatCount(video.metric ?? 0)}
      </p>
    </div>
  );
}

interface PodiumCardProps {
  video: RankedVideo;
  /** 1~3 名。 */
  rank: number;
  mode: RankingRowMode;
  metricLabel: string;
  /** #1 横贯整行、大缩略图；#2/#3 半行横卡。 */
  featured?: boolean;
}

function PodiumCard({ video, rank, mode, metricLabel, featured = false }: PodiumCardProps) {
  return (
    <Link
      href={`/watch/${video.id}`}
      className={cn(
        "group relative flex overflow-hidden rounded-xl border bg-surface-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        featured
          ? "flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-5 sm:p-4"
          : "items-center gap-3 p-3",
        rank === 1 ? "border-brand-200" : "border-hairline"
      )}
    >
      <div
        className={cn(
          "relative flex-shrink-0 overflow-hidden rounded-lg",
          featured ? "w-full sm:w-60 lg:w-72" : "w-24 sm:w-28"
        )}
      >
        <VideoThumbnail
          url={video.thumbnail_url}
          title={video.title}
          duration={video.duration}
          className="rounded-lg"
          hoverOverlay={
            <span className="flex h-10 w-10 scale-90 items-center justify-center rounded-full bg-brand-500 opacity-0 shadow-brand transition-all duration-150 group-hover:scale-100 group-hover:opacity-100">
              <Play size={16} fill="#fff" className="ml-0.5 text-white" />
            </span>
          }
        />
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <p
          className={cn(
            "font-mono text-[10px] font-semibold uppercase tracking-[0.14em]",
            rankClass(rank)
          )}
        >
          No.{rank}
        </p>
        <h3
          className={cn(
            "mt-1 line-clamp-2 font-bold leading-snug text-ink transition-colors duration-150 group-hover:text-brand-600",
            featured ? "text-base tracking-display-sm sm:text-lg" : "text-sm"
          )}
        >
          {video.title}
        </h3>
        {video.channel_name && (
          <p className="mt-1 line-clamp-1 text-xs text-muted">{video.channel_name}</p>
        )}
        <div className={featured ? "mt-3" : "mt-1.5"}>
          <PodiumMetric
            video={video}
            mode={mode}
            metricLabel={metricLabel}
            big={featured}
            accent={rank === 1}
          />
        </div>
      </div>

      {/* 巨型背景名次数字（编辑排版水印，不抢信息） */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -bottom-3 right-1 select-none font-display font-extrabold leading-none text-ink/[0.05]",
          featured ? "text-[110px] sm:text-[140px]" : "text-[88px]"
        )}
      >
        {rank}
      </span>
    </Link>
  );
}

export interface TopPodiumProps {
  /** 前 3 条（1~3 个；不足 3 个时布局自动退化）。 */
  items: RankedVideo[];
  mode: RankingRowMode;
  metricLabel?: string;
}

/** 前三名特辑：#1 大卡横贯整行，#2/#3 半行横卡并列。 */
export function TopPodium({ items, mode, metricLabel = "本周" }: TopPodiumProps) {
  const [first, ...rest] = items;
  if (!first) return null;
  return (
    <div className="grid gap-3 sm:gap-4">
      <PodiumCard video={first} rank={1} mode={mode} metricLabel={metricLabel} featured />
      {rest.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {rest.map((video, i) => (
            <PodiumCard
              key={video.id}
              video={video}
              rank={i + 2}
              mode={mode}
              metricLabel={metricLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { cn, formatCount, relativeTime } from "@/lib/utils";
import type { RankingScope } from "@/hooks/useRankings";
import type { RankedVideo } from "@/types";

/** 行右侧指标口径：metric = 周增量计数（weekly 榜）；time = 相对发布时间（latest 榜）。 */
export type RankingRowMode = "metric" | "time";

/** 各榜右侧指标的微标签（metric 模式；time 模式显示 NEW + 相对时间，不用此标签）。 */
export const RANKING_METRIC_LABELS: Record<RankingScope, string> = {
  latest: "上架时间",
  weekly_views: "本周播放",
  weekly_favorites: "本周收藏",
};

/** 名次数字配色：1 品牌橙 / 2 琥珀 / 3 深橙（暗色下提亮），其余浅灰。 */
function rankClass(rank: number): string {
  if (rank === 1) return "text-brand-500";
  if (rank === 2) return "text-accent-amber";
  if (rank === 3) return "text-brand-700";
  return "text-muted-soft";
}

export interface RankingRowProps {
  video: RankedVideo;
  /** 1-based 名次 —— 决定名次数字配色（1 品牌橙 / 2 琥珀 / 3 深橙 / 其余中性）。 */
  rank: number;
  mode: RankingRowMode;
  /** metric 模式的微标签，如「本周播放」「本周收藏」。 */
  metricLabel?: string;
  /** 榜单头名的指标值，用于右侧比例条（metric 模式）。 */
  maxMetric?: number;
}

/** 单行排行项：大号名次数字 + 缩略图 + 标题/频道 + 右侧指标与比例条。 */
export function RankingRow({
  video,
  rank,
  mode,
  metricLabel = "本周",
  maxMetric,
}: RankingRowProps) {
  const metric = video.metric ?? 0;
  const barPct =
    mode === "metric" && metric > 0 && maxMetric
      ? Math.max(4, Math.round((metric / maxMetric) * 100))
      : 0;
  const meta = [
    video.channel_name,
    mode === "metric" ? relativeTime(video.published_at ?? video.created_at) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/watch/${video.id}`}
      className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-surface-soft sm:gap-4"
    >
      <span
        className={cn(
          "w-6 flex-shrink-0 text-center font-display text-xl font-extrabold tabular-nums tracking-display-sm sm:w-8 sm:text-2xl",
          rankClass(rank)
        )}
      >
        {rank}
      </span>

      <div className="w-24 flex-shrink-0 overflow-hidden rounded-md sm:w-28">
        <VideoThumbnail
          url={video.thumbnail_url}
          title={video.title}
          duration={video.duration}
          className="rounded-md"
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink transition-colors duration-150 group-hover:text-brand-600 sm:line-clamp-1">
          {video.title}
        </p>
        {meta && <p className="mt-1 line-clamp-1 text-xs text-muted">{meta}</p>}
      </div>

      <div className="w-14 flex-shrink-0 text-right sm:w-20">
        {mode === "metric" ? (
          <>
            <p className="hidden text-[10px] font-semibold uppercase tracking-wider text-muted-soft sm:block">
              {metricLabel}
            </p>
            <p className="text-sm font-bold tabular-nums text-ink">{formatCount(metric)}</p>
            <div className="mt-1 hidden h-1 overflow-hidden rounded-pill bg-surface-card sm:block">
              <div
                className="h-full rounded-pill bg-brand-500 transition-[width] duration-300"
                style={{ width: `${barPct}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <span className="inline-block rounded-sm bg-brand-50 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.12em] text-brand-600">
              NEW
            </span>
            <p className="mt-1 text-[11px] tabular-nums text-muted">
              {relativeTime(video.published_at ?? video.created_at)}
            </p>
          </>
        )}
      </div>
    </Link>
  );
}

/** 排行行加载占位（与 RankingRow 同布局，避免数据到位时跳动）。 */
export function RankingRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2 py-2.5 sm:gap-4" aria-hidden>
      <div className="skeleton-shimmer h-6 w-6 flex-shrink-0 rounded-sm bg-surface-soft sm:h-7 sm:w-8" />
      <div className="skeleton-shimmer aspect-video w-24 flex-shrink-0 rounded-md bg-surface-soft sm:w-28" />
      <div className="flex-1 space-y-1.5">
        <div className="skeleton-shimmer h-4 w-3/4 rounded-sm bg-surface-soft" />
        <div className="skeleton-shimmer h-3 w-1/3 rounded-sm bg-surface-soft" />
      </div>
      <div className="skeleton-shimmer h-4 w-12 flex-shrink-0 rounded-sm bg-surface-soft sm:w-16" />
    </div>
  );
}

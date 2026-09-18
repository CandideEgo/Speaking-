"use client";

import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { Image } from "@/components/ui/Image";
import { formatCount, relativeTime } from "@/lib/utils";
import type { RankedVideo } from "@/types";

/** 行右侧指标口径：metric = 周增量计数（weekly 榜）；time = 相对发布时间（latest 榜）。 */
export type RankingRowMode = "metric" | "time";

function rankTone(rank: number): BadgeTone {
  if (rank === 1) return "brand";
  if (rank === 2) return "amber";
  if (rank === 3) return "orange";
  return "neutral";
}

export interface RankingRowProps {
  video: RankedVideo;
  /** 1-based 名次 —— 决定角标配色（1 品牌色 / 2 琥珀 / 3 橙 / 其余中性）。 */
  rank: number;
  mode: RankingRowMode;
}

/** 单行排行项：名次角标 + 缩略图 + 标题/频道 + 右侧指标。 */
export function RankingRow({ video, rank, mode }: RankingRowProps) {
  return (
    <Link
      href={`/watch/${video.id}`}
      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-soft"
    >
      <Badge
        tone={rankTone(rank)}
        className="h-5 w-5 flex-shrink-0 justify-center rounded-full px-0 text-[11px] font-bold"
      >
        {rank}
      </Badge>
      <div className="relative h-10 w-[72px] flex-shrink-0 overflow-hidden rounded-md bg-surface-card">
        <Image src={video.thumbnail_url} alt="" fill sizes="72px" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-medium text-ink">{video.title}</p>
        {video.channel_name && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted hidden sm:block">
            {video.channel_name}
          </p>
        )}
      </div>
      <span className="flex-shrink-0 text-xs font-semibold tabular-nums text-muted">
        {mode === "metric"
          ? formatCount(video.metric ?? 0)
          : relativeTime(video.published_at ?? video.created_at)}
      </span>
    </Link>
  );
}

/** 排行行加载占位（与 RankingRow 同布局，避免数据到位时跳动）。 */
export function RankingRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2 py-2" aria-hidden>
      <div className="skeleton-shimmer h-5 w-5 flex-shrink-0 rounded-full bg-surface-soft" />
      <div className="skeleton-shimmer h-10 w-[72px] flex-shrink-0 rounded-md bg-surface-soft" />
      <div className="flex-1 space-y-1.5">
        <div className="skeleton-shimmer h-4 w-3/4 rounded-sm bg-surface-soft" />
        <div className="skeleton-shimmer h-3 w-1/3 rounded-sm bg-surface-soft" />
      </div>
      <div className="skeleton-shimmer h-4 w-10 flex-shrink-0 rounded-sm bg-surface-soft" />
    </div>
  );
}

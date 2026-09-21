"use client";

import { useState } from "react";
import { PageTransition } from "@/components/common/PageTransition";
import { FullPageSpinner } from "@/components/common/Spinner";
import {
  RANKING_METRIC_LABELS,
  RankingRow,
  RankingRowSkeleton,
} from "@/components/rankings/RankingRow";
import { TopPodium } from "@/components/rankings/TopPodium";
import { TabPills } from "@/components/ui/TabPills";
import { useRankings, type RankingScope } from "@/hooks/useRankings";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const TABS: { key: RankingScope; label: string }[] = [
  { key: "latest", label: "最新" },
  { key: "weekly_views", label: "本周热播" },
  { key: "weekly_favorites", label: "本周收藏" },
];

/** 骨架行数：服务端最多返回 20 条，占位取一半避免闪烁过高。 */
const SKELETON_ROWS = 10;

export default function RankingsPage() {
  const { isAuthenticated, isLoading: authLoading } = useRequireAuth();
  const [scope, setScope] = useState<RankingScope>("latest");
  const { items, loading } = useRankings(scope);

  if (authLoading || !isAuthenticated) return <FullPageSpinner />;

  const mode = scope === "latest" ? "time" : "metric";
  const metricLabel = RANKING_METRIC_LABELS[scope];
  const maxMetric = Math.max(0, ...items.map((v) => v.metric ?? 0));

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-10">
        <header className="mb-6">
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_#ff5a1f]" />
            Trending · 榜单
          </p>
          <h1 className="mt-2 text-[28px] font-extrabold tracking-display-sm text-ink">排行</h1>
          <p className="mt-1 text-[13px] text-muted">最新上架，以及本周热播、收藏趋势</p>
        </header>
        <TabPills
          tabs={TABS}
          activeKey={scope}
          onChange={setScope}
          variant="ghost"
          activeStyle="dark"
          size="sm"
        />
        {loading ? (
          <div className="mt-4 divide-y divide-hairline rounded-xl border border-hairline bg-surface-card">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <RankingRowSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted">暂无数据</p>
        ) : (
          <div key={scope} className="stagger-container mt-4 grid gap-4">
            <TopPodium items={items.slice(0, 3)} mode={mode} metricLabel={metricLabel} />
            {items.length > 3 && (
              <div className="divide-y divide-hairline rounded-xl border border-hairline bg-surface-card">
                {items.slice(3).map((video, i) => (
                  <RankingRow
                    key={video.id}
                    video={video}
                    rank={i + 4}
                    mode={mode}
                    metricLabel={metricLabel}
                    maxMetric={maxMetric}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </PageTransition>
  );
}

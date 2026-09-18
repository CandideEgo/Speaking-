"use client";

import { useState } from "react";
import { PageTransition } from "@/components/common/PageTransition";
import { FullPageSpinner } from "@/components/common/Spinner";
import { RankingRow, RankingRowSkeleton } from "@/components/rankings/RankingRow";
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

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-10">
        <div className="mb-6">
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">排行</h1>
          <p className="mt-1 text-[13px] text-muted">最新上架，以及本周热播、收藏趋势</p>
        </div>
        <TabPills
          tabs={TABS}
          activeKey={scope}
          onChange={setScope}
          variant="ghost"
          activeStyle="dark"
          size="sm"
        />
        {loading ? (
          <div className="mt-4 divide-y divide-hairline rounded-lg border border-hairline bg-surface-card">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <RankingRowSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-20 text-center text-sm text-muted">暂无数据</p>
        ) : (
          <div className="mt-4 divide-y divide-hairline rounded-lg border border-hairline bg-surface-card">
            {items.map((video, i) => (
              <RankingRow
                key={video.id}
                video={video}
                rank={i + 1}
                mode={scope === "latest" ? "time" : "metric"}
              />
            ))}
          </div>
        )}
      </main>
    </PageTransition>
  );
}

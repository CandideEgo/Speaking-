"use client";

import { useState } from "react";
import Link from "next/link";
import { RankingRow, RankingRowSkeleton } from "@/components/rankings/RankingRow";
import { TabPills } from "@/components/ui/TabPills";
import { useRankings, type RankingScope } from "@/hooks/useRankings";

const TABS: { key: RankingScope; label: string }[] = [
  { key: "latest", label: "最新" },
  { key: "weekly_views", label: "本周热播" },
  { key: "weekly_favorites", label: "本周收藏" },
];

/** 首页排行块每榜只取前 5 条（后端返回最多 20 条）。 */
const BLOCK_LIMIT = 5;

export function RankingBlock() {
  const [scope, setScope] = useState<RankingScope>("latest");
  const { items, loading } = useRankings(scope);

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-ink">排行</h2>
        <Link href="/rankings" className="text-sm font-semibold text-brand-500 hover:underline">
          更多
        </Link>
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
        <div className="mt-2 divide-y divide-hairline rounded-lg border border-hairline bg-surface-card">
          {Array.from({ length: BLOCK_LIMIT }).map((_, i) => (
            <RankingRowSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-2 py-10 text-center text-sm text-muted">暂无数据</p>
      ) : (
        <div className="mt-2 divide-y divide-hairline rounded-lg border border-hairline bg-surface-card">
          {items.slice(0, BLOCK_LIMIT).map((video, i) => (
            <RankingRow
              key={video.id}
              video={video}
              rank={i + 1}
              mode={scope === "latest" ? "time" : "metric"}
            />
          ))}
        </div>
      )}
    </section>
  );
}

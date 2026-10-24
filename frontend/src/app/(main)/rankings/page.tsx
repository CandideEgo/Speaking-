"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { FullPageSpinner } from "@/components/common/Spinner";
import {
  RANKING_METRIC_LABELS,
  RankingRow,
  RankingRowSkeleton,
} from "@/components/rankings/RankingRow";
import { TopPodium } from "@/components/rankings/TopPodium";
import { TabPills } from "@/components/ui/TabPills";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton } from "@/components/ui/LinkButton";
import { useRankings, type RankingScope } from "@/hooks/useRankings";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { scrollKey } from "@/lib/scrollMemory";
import { Card } from "@/components/ui/Card";

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
  const { items, loading, error, retry } = useRankings(scope);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useScrollRestore(scrollKey(pathname, searchParams.toString()), items.length > 0);

  if (authLoading || !isAuthenticated) return <FullPageSpinner />;

  const mode = scope === "latest" ? "time" : "metric";
  const metricLabel = RANKING_METRIC_LABELS[scope];
  const maxMetric = Math.max(0, ...items.map((v) => v.metric ?? 0));

  return (
    <PageTransition>
      <div className="user-page">
        <PageHeader crumb="视频排行" title="排行" variant="eyebrow" />
        <TabPills
          tabs={TABS}
          activeKey={scope}
          onChange={setScope}
          variant="ghost"
          activeStyle="dark"
          size="sm"
          className="mt-4"
        />
        {loading ? (
          <Card variant="surface" padding={0} className="mt-4 divide-y divide-hairline">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <RankingRowSkeleton key={i} />
            ))}
          </Card>
        ) : error ? (
          <ErrorState title={error} onRetry={retry} className="py-10" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="暂无数据"
            description="暂无榜单内容，可以先去发现感兴趣的视频。"
            action={
              <LinkButton href="/" variant="outline" size="sm">
                去浏览视频
              </LinkButton>
            }
          />
        ) : (
          <div key={scope} className="stagger-container mt-4 grid gap-4">
            <TopPodium items={items.slice(0, 3)} mode={mode} metricLabel={metricLabel} />
            {items.length > 3 && (
              <Card variant="surface" padding={0} className="divide-y divide-hairline">
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
              </Card>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Image } from "@/components/ui/Image";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabPills } from "@/components/ui/TabPills";
import { MetricCard } from "@/components/ui/MetricCard";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { usePlan } from "@/hooks/usePlan";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { relativeTime, formatTimeSpent, groupByDate } from "@/lib/date";
import { Calendar, Clock, CheckCircle, PlayCircle, Flame } from "lucide-react";
import type { LearningRecord, Paginated } from "@/types";

type FilterKey = "all" | "active" | "completed";

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "学习中" },
  { key: "completed", label: "已完成" },
];

export default function HistoryPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const { profile } = usePlan();
  const [filter, setFilter] = useState<FilterKey>("all");

  const {
    items: records,
    total,
    hasMore,
    loading,
    loaderRef,
  } = usePaginatedList<LearningRecord>({
    fetcher: (pg) => {
      const params = new URLSearchParams({ page: String(pg), page_size: "20" });
      if (filter === "active") params.set("completed", "false");
      if (filter === "completed") params.set("completed", "true");
      return api<Paginated<LearningRecord>>(`/api/v1/learning/records?${params.toString()}`);
    },
    mode: "append",
    filters: [filter],
    enabled: isAuthenticated && !isLoading,
  });

  // Summary stats（原型 12 stat-grid：本周学习时长/已学视频/学完视频/连续天数）
  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekSeconds = records
      .filter((r) => new Date(r.last_accessed_at || r.created_at).getTime() >= weekAgo)
      .reduce((sum, r) => sum + r.time_spent_seconds, 0);
    const completedCount = records.filter((r) => r.completed).length;
    return { weekSeconds, completedCount };
  }, [records]);

  // Date grouping
  const groups = useMemo(
    () => groupByDate(records, (r) => r.last_accessed_at || r.created_at),
    [records]
  );

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-12">
        {/* Header */}
        <PageHeader crumb="学习历史" title="学习记录" />

        {/* Summary stats（原型 12 stat-grid） */}
        {records.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
            <MetricCard
              icon={Clock}
              label="本周学习时长"
              value={formatTimeSpent(stats.weekSeconds)}
              variant="label-top"
            />
            <MetricCard icon={PlayCircle} label="已学视频" value={total} variant="label-top" />
            <MetricCard
              icon={CheckCircle}
              label="学完视频"
              value={stats.completedCount}
              tone="success"
              variant="label-top"
            />
            <MetricCard
              icon={Flame}
              label="连续天数"
              value={profile?.current_streak ?? 0}
              tone="brand"
              variant="label-top"
            />
          </div>
        )}

        {/* Filter tabs */}
        <div className="mb-6">
          <TabPills
            tabs={FILTER_TABS}
            activeKey={filter}
            onChange={setFilter}
            variant="default"
            activeStyle="dark"
            size="sm"
          />
        </div>

        {/* Content */}
        {loading && records.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-muted-soft border-t-ink rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <EmptyState icon={Calendar} title="暂无学习记录" className="py-12" />
        ) : (
          <div>
            {groups.map((group) => (
              <div key={group.label}>
                <h4 className="text-xs font-semibold text-muted uppercase tracking-caption-wide mb-3 mt-6 first:mt-0">
                  {group.label}
                </h4>
                <div className="space-y-2">
                  {group.items.map((record) => (
                    <RecordCard key={record.id} record={record} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Infinite scroll trigger */}
        <div ref={loaderRef} className="flex justify-center mt-8">
          {loading && records.length > 0 && (
            <div className="w-5 h-5 border-2 border-muted-soft border-t-ink rounded-full animate-spin" />
          )}
          {!hasMore && records.length > 0 && !loading && (
            <p className="text-xs text-muted">已加载全部内容</p>
          )}
        </div>
      </main>
    </PageTransition>
  );
}

/** Single learning record row. */
function RecordCard({ record }: { record: LearningRecord }) {
  const timeAgo = relativeTime(record.last_accessed_at || record.created_at);

  return (
    <Link
      href={`/watch/${record.video_id}`}
      className="flex items-center gap-4 p-4 rounded-lg border border-hairline bg-canvas hover:bg-surface-soft transition-colors"
    >
      {/* Thumbnail */}
      <div className="relative h-14 w-24 rounded-md bg-surface-card overflow-hidden flex-shrink-0">
        <Image
          src={record.video?.thumbnail_url}
          alt=""
          fill
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-lg">🎬</div>
          }
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{record.video?.title || "未知视频"}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted flex-wrap">
          <span>{record.words_learned} 个生词</span>
          {record.time_spent_seconds > 0 && (
            <span>{formatTimeSpent(record.time_spent_seconds)}</span>
          )}
          {record.quiz_score !== null && <span>测验 {Math.round(record.quiz_score)} 分</span>}
          {record.completed && <span className="text-success">✓ 已完成</span>}
          <span className="text-muted-soft">{timeAgo}</span>
        </div>
      </div>

      {/* Progress + resume label */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-24">
          <div className="h-1.5 rounded-full bg-surface-card">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${Math.min(record.progress_percentage, 100)}%` }}
            />
          </div>
        </div>
        <span className="text-xs text-muted w-10 text-right">
          {Math.round(record.progress_percentage)}%
        </span>
        <span
          className={
            "inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[11px] font-semibold flex-shrink-0 " +
            (record.completed ? "bg-surface-card text-muted" : "bg-brand-50 text-brand-600")
          }
        >
          {record.completed ? "复习" : "续播"}
        </span>
      </div>
    </Link>
  );
}

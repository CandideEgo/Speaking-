"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowRight, Bell, Bookmark, Calendar, Check, Play } from "lucide-react";
import { api } from "@/lib/api";
import { Image } from "@/components/ui/Image";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabPills } from "@/components/ui/TabPills";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { usePlan } from "@/hooks/usePlan";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { scrollKey } from "@/lib/scrollMemory";
import { watchHref } from "@/lib/watchEntry";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { InlineSpinner } from "@/components/common/Spinner";
import { PageTransition } from "@/components/common/PageTransition";
import { LinkButton } from "@/components/ui/LinkButton";
import { Button } from "@/components/ui/Button";
import { DifficultyBadge } from "@/components/video/DifficultyBadge";
import { VideoTitle } from "@/components/video/VideoTitle";
import { formatDuration } from "@/lib/format";
import { formatTimeSpent } from "@/lib/date";
import { videoTitleZh } from "@/lib/videoDisplay";
import type { LearningRecord, Paginated } from "@/types";

type FilterKey = "all" | "active" | "completed";

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "active", label: "学习中" },
  { key: "completed", label: "已完成" },
];

/**
 * 分组：今天 / 昨天 / 更早（对齐 stage-3/history.html）。
 *
 * 共享 `groupByDate` 多一个「本周」档（今天/昨天之外的最近 7 天），会把
 * 3–7 天前的记录单独成组，与设计三组口径不符；这里页面内自持三组口径。
 */
function dayBucket(iso: string | null): "今天" | "昨天" | "更早" {
  if (!iso) return "更早";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "更早";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const t = then.getTime();
  if (t >= todayStart) return "今天";
  if (t >= yesterdayStart) return "昨天";
  return "更早";
}

function formatRecordTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const bucket = dayBucket(iso);
  if (bucket === "今天") return `今天 ${hh}`;
  if (bucket === "昨天") return `昨天 ${hh}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}`;
}

function formatClock(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 本周时长：设计口径写「3.4 小时」，按量级选单位。 */
function weekDuration(seconds: number): { value: string; unit: string } {
  if (!seconds || seconds < 60) {
    return { value: String(Math.max(0, Math.round(seconds))), unit: "秒" };
  }
  if (seconds < 3600) return { value: String(Math.floor(seconds / 60)), unit: "分钟" };
  return { value: (seconds / 3600).toFixed(1), unit: "小时" };
}

export default function HistoryPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const { profile } = usePlan();
  const [filter, setFilter] = useState<FilterKey>("all");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    items: records,
    hasMore,
    loading,
    error,
    loaderRef,
    reload,
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

  useScrollRestore(scrollKey(pathname, searchParams.toString()), records.length > 0);

  // 汇总统计（设计 4 项 stat：本周学习时长 / 已学视频 / 学完视频 / 连续学习）。
  const [stats, setStats] = useState<{
    weekSeconds: number;
    completedCount: number;
    overallTotal: number;
  } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    let alive = true;
    Promise.all([
      api<{ this_week_minutes: number }>("/api/v1/learning/stats/weekly").catch(() => null),
      api<Paginated<LearningRecord>>(
        "/api/v1/learning/records?page=1&page_size=1&completed=true"
      ).catch(() => null),
      api<Paginated<LearningRecord>>("/api/v1/learning/records?page=1&page_size=1").catch(
        () => null
      ),
    ]).then(([weekly, completed, overall]) => {
      if (!alive) return;
      setStats({
        weekSeconds: (weekly?.this_week_minutes ?? 0) * 60,
        completedCount: completed?.total ?? 0,
        overallTotal: overall?.total ?? 0,
      });
    });
    return () => {
      alive = false;
    };
  }, [isAuthenticated, isLoading]);

  // 三组：今天 / 昨天 / 更早。组头带「N 段 · 共 X 分钟」（设计口径）。
  const groups = useMemo(() => {
    const order: ("今天" | "昨天" | "更早")[] = ["今天", "昨天", "更早"];
    const buckets = new Map<string, LearningRecord[]>(order.map((k) => [k, []]));
    for (const record of records) {
      const key = dayBucket(record.last_accessed_at || record.created_at);
      buckets.get(key)!.push(record);
    }
    return order
      .map((label) => {
        const items = buckets.get(label)!;
        const seconds = items.reduce((sum, r) => sum + (r.time_spent_seconds || 0), 0);
        return { label, items, seconds };
      })
      .filter((g) => g.items.length > 0);
  }, [records]);

  const todayCount = useMemo(
    () => records.filter((r) => dayBucket(r.last_accessed_at || r.created_at) === "今天").length,
    [records]
  );
  const wordsLearned = useMemo(
    () => records.reduce((sum, r) => sum + (r.words_learned || 0), 0),
    [records]
  );

  const week = weekDuration(stats?.weekSeconds ?? 0);
  const overallTotal = stats?.overallTotal ?? 0;
  const completedCount = stats?.completedCount ?? 0;
  const activeCount = Math.max(overallTotal - completedCount, 0);

  const resume = useMemo(
    () =>
      records.find((r) => !r.completed && (r.progress_percentage > 0 || r.time_spent_seconds > 0)),
    [records]
  );

  const counts: Record<FilterKey, number> = {
    all: overallTotal,
    active: activeCount,
    completed: completedCount,
  };

  const tabs = FILTER_TABS.map((t) => ({
    key: t.key,
    label: (
      <span className="inline-flex items-center gap-1.5">
        {t.label}
        <span className="text-caption font-medium text-muted">{counts[t.key]}</span>
      </span>
    ),
  }));

  return (
    <PageTransition>
      <div className="user-page">
        <PageHeader
          crumb="我的"
          title="观看历史"
          description="按天排出看过的每一段，带进度和停留时长。想接着上次的地方继续，点每行右侧的「继续观看」。"
          actions={
            resume ? (
              <LinkButton
                href={watchHref(resume.video_id, { from: "history" })}
                variant="primary"
                icon={Play}
              >
                继续《
                {(resume.video ? videoTitleZh(resume.video) : "上一段").slice(0, 18)}》
              </LinkButton>
            ) : undefined
          }
        />

        {/* 汇总统计：设计是平铺 stat-grid（20px 数值 + 13px 中性标签） */}
        {stats && overallTotal > 0 && (
          <div className="mt-6 user-stat-grid">
            <div className="user-stat">
              <span className="user-stat-num">
                {week.value}
                <span className="ml-1 text-meta font-semibold text-muted">{week.unit}</span>
              </span>
              <span className="user-stat-label">本周学习时长</span>
            </div>
            <div className="user-stat">
              <span className="user-stat-num">
                {overallTotal}
                <span className="ml-1 text-meta font-semibold text-muted">段</span>
              </span>
              <span className="user-stat-label">已学视频</span>
            </div>
            <div className="user-stat">
              <span className="user-stat-num">
                {completedCount}
                <span className="ml-1 text-meta font-semibold text-muted">段</span>
              </span>
              <span className="user-stat-label">学完视频</span>
            </div>
            <div className="user-stat">
              <span className="user-stat-num">
                {profile?.current_streak ?? 0}
                <span className="ml-1 text-meta font-semibold text-muted">天</span>
              </span>
              <span className="user-stat-label">连续学习</span>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <TabPills
            tabs={tabs}
            activeKey={filter}
            onChange={(key) => setFilter(key as FilterKey)}
          />
          <span className="text-meta text-muted">共 {overallTotal} 段记录</span>
        </div>

        <div className="user-page-layout has-aside">
          <div className="user-page-main">
            {loading && records.length === 0 ? (
              <InlineSpinner className="py-12" />
            ) : error && records.length === 0 ? (
              <ErrorState title={error} onRetry={reload} className="py-12" />
            ) : records.length === 0 && overallTotal === 0 ? (
              <EmptyState
                icon={Calendar}
                title="暂无学习记录"
                description="看完第一个视频就会出现在这里"
                action={
                  <Link
                    href="/"
                    className="mt-3 inline-block text-copy font-semibold text-brand-700 hover:underline"
                  >
                    开始学习 →
                  </Link>
                }
                className="py-12"
              />
            ) : records.length === 0 ? (
              /* 筛选无结果 ≠ 没有记录：给筛选专用空态 + 回全部记录（设计口径）。 */
              <div className="rounded-lg border border-dashed border-hairline-strong bg-surface-soft p-5">
                <p className="text-copy font-semibold text-ink">这个筛选下还没有记录</p>
                <p className="mt-1 max-w-[44ch] text-copy leading-relaxed text-body">
                  {filter === "completed"
                    ? `「已完成」只统计看到最后一行的视频，目前有 ${completedCount} 段；在学的还有 ${activeCount} 段，换成「全部」能看到 ${overallTotal} 段。`
                    : `「学习中」只统计还没看到最后一行的视频，目前有 ${activeCount} 段；已看完的有 ${completedCount} 段，换成「全部」能看到 ${overallTotal} 段。`}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                    看全部记录
                  </Button>
                  <LinkButton href="/" variant="text" size="sm" iconRight>
                    去浏览视频
                  </LinkButton>
                </div>
              </div>
            ) : (
              <div>
                {groups.map((group) => (
                  <section key={group.label}>
                    <h3 className="mb-2 mt-6 text-meta font-bold tracking-[0.06em] text-muted first:mt-0">
                      {group.label} · {group.items.length} 段 · 共 {formatTimeSpent(group.seconds)}
                    </h3>
                    <ul className="divide-y divide-hairline-soft">
                      {group.items.map((record) => (
                        <RecordRow key={record.id} record={record} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            <div ref={loaderRef} className="mt-8 flex justify-center">
              {loading && records.length > 0 && (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-soft border-t-ink" />
              )}
              {!hasMore && records.length > 0 && !loading && (
                <p className="text-meta text-muted">已加载全部内容</p>
              )}
            </div>
          </div>

          <aside className="user-page-aside" aria-label="记录说明">
            <section className="user-aside-sec">
              <h2 className="user-aside-title">这些数字怎么算</h2>
              <div className="user-kv">
                <div className="user-kv-row">
                  <span className="user-kv-key">记录条数</span>
                  <span className="user-kv-val">{overallTotal} 段</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">今天</span>
                  <span className="user-kv-val">{todayCount} 段</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">生词合计</span>
                  <span className="user-kv-val">{wordsLearned} 个</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">连续学习</span>
                  <span className="user-kv-val">{profile?.current_streak ?? 0} 天</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">本周时长</span>
                  <span className="user-kv-val">
                    {week.value} {week.unit}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-meta leading-relaxed text-body">
                停留时长按播放器实际播放时间累计，暂停和切走不算。进度按看到的时间点除以总时长。
              </p>
            </section>
            <section className="user-aside-sec">
              <h2 className="user-aside-title">从记录回到学习</h2>
              <div className="flex flex-col gap-2">
                <Link
                  href="/favorites"
                  className="inline-flex items-center gap-2 text-meta text-body transition-colors hover:text-ink"
                >
                  <Bookmark size={14} className="text-muted" />
                  收藏的句子和词
                </Link>
                <Link
                  href="/vocabulary"
                  className="inline-flex items-center gap-2 text-meta text-body transition-colors hover:text-ink"
                >
                  <Bookmark size={14} className="text-muted" />
                  今天到期的词
                </Link>
                <Link
                  href="/notifications"
                  className="inline-flex items-center gap-2 text-meta text-body transition-colors hover:text-ink"
                >
                  <Bell size={14} className="text-muted" />
                  学习提醒
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </PageTransition>
  );
}

/** 单条学习记录：发丝线行（缩略图 / 标题+元信息 / 进度+继续观看）。 */
function RecordRow({ record }: { record: LearningRecord }) {
  const pct = Math.min(Math.max(record.progress_percentage || 0, 0), 100);
  const duration = record.video?.duration ?? null;
  const remaining =
    duration && !record.completed ? Math.max(0, Math.round(duration * (1 - pct / 100))) : null;
  const href = watchHref(record.video_id, { from: "history" });
  const titleZh = record.video ? videoTitleZh(record.video) : "未知视频";

  return (
    <li className="grid grid-cols-1 items-center gap-3 py-4 md:grid-cols-[10rem_minmax(0,1fr)_13rem]">
      <Link
        href={href}
        aria-label={`继续观看 ${titleZh}`}
        className="relative block aspect-video overflow-hidden rounded-md border border-hairline bg-surface-card"
      >
        <Image
          src={record.video?.thumbnail_url}
          alt=""
          fill
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-title">🎬</div>
          }
        />
        {duration != null && duration > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-surface-dark/80 px-1 text-caption font-semibold tabular-nums text-on-dark">
            {formatDuration(duration)}
          </span>
        )}
      </Link>

      <div className="min-w-0">
        {record.video ? (
          <Link href={href} className="block hover:text-brand-700">
            <VideoTitle
              video={record.video}
              as="span"
              zhClassName="text-copy font-semibold leading-snug text-ink"
            />
          </Link>
        ) : (
          <p className="text-copy font-semibold leading-snug text-ink">未知视频</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted">
          {record.video?.channel_name && <span>{record.video.channel_name}</span>}
          <DifficultyBadge level={record.video?.difficulty_level} size="sm" />
          {record.time_spent_seconds > 0 && (
            <span>看了 {formatTimeSpent(record.time_spent_seconds)}</span>
          )}
          {record.position_seconds != null && (
            <span>停在 {formatClock(record.position_seconds)}</span>
          )}
          {record.completed && (
            <span className="inline-flex items-center gap-1 font-semibold text-success-text">
              <Check size={12} />
              已完成
            </span>
          )}
          <span>{formatRecordTime(record.last_accessed_at || record.created_at)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 rounded-pill bg-surface-card">
            <div
              className="h-full rounded-pill bg-brand-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-10 text-right text-meta tabular-nums text-body">
            {Math.round(pct)}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-muted">
            {record.completed
              ? "看完了，可再听一遍"
              : remaining != null
                ? `还剩 ${formatTimeSpent(remaining)}`
                : "从上次的位置接着看"}
          </span>
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-meta font-semibold text-body transition-colors hover:text-brand-700"
          >
            {record.completed ? "复习" : "继续观看"}
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </li>
  );
}

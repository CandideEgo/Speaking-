"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import {
  Flame,
  Mic,
  BookOpen,
  Zap,
  BarChart3,
  RotateCcw,
  Play,
} from "lucide-react";
import Link from "next/link";
import ActivityHeatmap from "@/components/dashboard/ActivityHeatmap";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { VideoCard } from "@/components/ui/VideoCard";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import type { DailyActivity, StreakInfo } from "@/types";

// --- Types ---

interface SpeakingStats {
  total_speaking_attempts: number;
  average_accuracy: number;
  average_fluency: number;
  average_completeness: number;
  total_vocabulary: number;
  total_videos_watched: number;
}

interface VocabStats {
  total: number;
  due_count: number;
  learning_count: number;
  mastered_count: number;
}

interface LearningRecord {
  id: string;
  video_id: string;
  video: {
    title: string;
    thumbnail_url: string | null;
  } | null;
  speaking_attempts: number;
  words_learned: number;
  quiz_score: number | null;
  completed: boolean;
  created_at: string;
  last_accessed_at: string | null;
}

interface DashboardData {
  speakingStats: SpeakingStats;
  vocabStats: VocabStats;
  activities: DailyActivity[];
  recentRecords: LearningRecord[];
  streak: StreakInfo;
}

// --- Helpers ---

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function getPastWeekLabels(): string[] {
  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  const result: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    // getDay() returns 0 for Sunday; map to 日
    const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1;
    result.push(labels[dayIndex]);
  }
  return result;
}

const ACTIVITY_COLORS: Record<string, string> = {
  speaking: "bg-brand-500",
  vocabulary: "bg-indigo",
  quiz: "bg-success",
  watching: "bg-warning",
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  speaking: <Mic size={15} className="text-on-primary" />,
  vocabulary: <BookOpen size={15} className="text-on-primary" />,
  quiz: <Zap size={15} className="text-on-primary" />,
  watching: <BarChart3 size={15} className="text-on-primary" />,
};

// --- Page ---

export default function DashboardPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(false);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;

      const [
        rawSpeakingStats,
        vocabStats,
        activityCurr,
        activityPrev,
        recordsRes,
        streakRes,
      ] = await Promise.all([
        api<SpeakingStats & { total_videos?: number }>(
          "/api/v1/speaking/stats?period=all",
        ).catch(() => ({
          total_speaking_attempts: 0,
          average_accuracy: 0,
          average_fluency: 0,
          average_completeness: 0,
          total_vocabulary: 0,
          total_videos_watched: 0,
        })),
        api<VocabStats>("/api/v1/vocabulary/stats").catch(() => ({
          total: 0,
          due_count: 0,
          learning_count: 0,
          mastered_count: 0,
        })),
        api<{ activities: DailyActivity[] }>(
          `/api/v1/users/me/activity?year=${year}&month=${month}`,
        ).catch(() => ({ activities: [] })),
        api<{ activities: DailyActivity[] }>(
          `/api/v1/users/me/activity?year=${prevYear}&month=${prevMonth}`,
        ).catch(() => ({ activities: [] })),
        api<{ records: LearningRecord[] }>(
          "/api/v1/learning/records?page=1&page_size=5",
        ).catch(() => ({ records: [] })),
        api<StreakInfo>("/api/v1/users/me/streak").catch(() => ({
          current_streak: 0,
          longest_streak: 0,
          last_active_at: null,
          goal_type: null,
          goal_value: 0,
          today_progress: {},
        })),
      ]);

      setData({
        speakingStats: {
          ...rawSpeakingStats,
          total_videos_watched:
            rawSpeakingStats.total_videos_watched ??
            (rawSpeakingStats as { total_videos?: number }).total_videos ??
            0,
        },
        vocabStats,
        activities: [...activityCurr.activities, ...activityPrev.activities],
        recentRecords: recordsRes.records,
        streak: streakRes,
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    loadData();
  }, [isAuthenticated, isLoading, router]);

  // Weekly activity from the daily-activity snapshots (last 7 days).
  const weeklyActivity = useMemo(() => {
    const counts: number[] = Array(7).fill(0);
    const today = new Date();
    const map = new Map<string, number>();
    for (const a of data?.activities ?? [])
      map.set(a.date, a.speaking_attempts);

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      counts[6 - i] = map.get(key) ?? 0;
    }

    return {
      labels: getPastWeekLabels(),
      counts,
      max: Math.max(...counts, 1),
    };
  }, [data?.activities]);

  // Current month for the heatmap component.
  const heatmapMonth = useMemo(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, []);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  const userName = user?.name || "学习者";
  const streak = data?.streak?.current_streak ?? 0;

  return (
    <main className="min-h-full bg-canvas">
      <div className="container-page py-8">
        {/* Hero greeting */}
        <div className="mb-7 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="eyebrow">
              <span className="eyebrow-pip" />
              本周学习
            </span>
            <h1 className="!text-[36px] !font-extrabold !tracking-display-lg !mt-2">
              你好,{userName} 👋
            </h1>
            <p className="text-muted mt-1.5">
              你已经连续学习 <b className="text-brand-500">{streak} 天</b>
              ,继续保持!
            </p>
          </div>
          <Button
            onClick={loadData}
            disabled={loading}
            variant="outline"
            icon={RotateCcw}
            size="sm"
            aria-label="刷新数据"
          >
            刷新
          </Button>
        </div>

        {loading && !data ? (
          <InlineSpinner />
        ) : error ? (
          <ErrorState
            icon={BarChart3}
            title="加载数据失败，请稍后重试"
            onRetry={loadData}
          />
        ) : data ? (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-[18px] mb-6">
              <div className="dash-stat">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="dash-stat-icon bg-brand-50 text-brand-500">
                    <Flame size={19} />
                  </div>
                </div>
                <div className="dash-stat-num">
                  {data.speakingStats.total_speaking_attempts}
                </div>
                <div className="dash-stat-label">口语练习次数</div>
              </div>
              <div className="dash-stat">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="dash-stat-icon bg-indigo-soft text-indigo">
                    <Mic size={19} />
                  </div>
                </div>
                <div className="dash-stat-num">
                  {Math.round(data.speakingStats.average_accuracy)}%
                </div>
                <div className="dash-stat-label">平均准确度</div>
              </div>
              <div className="dash-stat">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="dash-stat-icon bg-success-soft text-success">
                    <BookOpen size={19} />
                  </div>
                </div>
                <div className="dash-stat-num">{data.vocabStats.total}</div>
                <div className="dash-stat-label">新增词汇</div>
              </div>
              <div className="dash-stat">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="dash-stat-icon bg-warning-soft text-warning">
                    <Zap size={19} />
                  </div>
                </div>
                <div className="dash-stat-num">
                  {data.speakingStats.total_videos_watched}
                </div>
                <div className="dash-stat-label">已学视频</div>
              </div>
            </div>

            {/* Bar chart + Heatmap row */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-[18px] mb-6">
              {/* Bar chart */}
              <div className="bg-canvas border border-hairline rounded-lg p-6">
                <h3 className="!text-base !font-bold !m-0 !mb-1">
                  本周口语练习
                </h3>
                <p className="text-[13px] text-muted !m-0 !mb-5">
                  每日练习次数
                </p>
                <div className="bar-chart">
                  {weeklyActivity.counts.map((count, i) => {
                    const pct = (count / weeklyActivity.max) * 100;
                    const isMax = count === weeklyActivity.max && count > 0;
                    return (
                      <div key={i} className="bar-col">
                        <div
                          className={cn("bar-fill", isMax && "bar-fill-hi")}
                          style={{ height: `${Math.max(pct, 10)}%` }}
                        />
                        <div className="bar-label">
                          {weeklyActivity.labels[i]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Heatmap */}
              <div className="bg-canvas border border-hairline rounded-lg p-6">
                <h3 className="!text-base !font-bold !m-0 !mb-1">学习热力图</h3>
                <p className="text-[13px] text-muted !m-0 !mb-5">本月</p>
                <ActivityHeatmap
                  activities={data.activities}
                  year={heatmapMonth.year}
                  month={heatmapMonth.month}
                />
              </div>
            </div>

            {/* Timeline */}
            {data.recentRecords.length > 0 && (
              <div className="bg-canvas border border-hairline rounded-lg p-6 mb-6">
                <h3 className="!text-base !font-bold !m-0 !mb-1">最近学习</h3>
                <p className="text-[13px] text-muted !m-0 !mb-5">
                  你的学习时间线
                </p>
                <div className="flex flex-col gap-3">
                  {data.recentRecords.map((record, i) => {
                    const activityType =
                      record.speaking_attempts > 0
                        ? "speaking"
                        : record.words_learned > 0
                          ? "vocabulary"
                          : "watching";
                    const color = ACTIVITY_COLORS[activityType] || "bg-muted";
                    const icon = ACTIVITY_ICONS[activityType] || (
                      <Zap size={15} className="text-on-primary" />
                    );
                    return (
                      <div key={record.id} className="tl-item">
                        <div className="tl-dot-line">
                          <div className={cn("tl-dot", color)}>{icon}</div>
                          {i < data.recentRecords.length - 1 && (
                            <div className="tl-line" />
                          )}
                        </div>
                        <div className="tl-body">
                          <Link
                            href={`/watch/${record.video_id}`}
                            className="tl-title hover:text-brand-500"
                          >
                            {record.video?.title || "未知视频"}
                          </Link>
                          <div className="tl-desc">
                            {record.speaking_attempts > 0 &&
                              `${record.speaking_attempts} 次跟读 `}
                            {record.words_learned > 0 &&
                              `${record.words_learned} 个生词 `}
                            {record.completed && (
                              <span className="text-success">· 已完成</span>
                            )}
                          </div>
                          <div className="tl-time">
                            {timeAgo(
                              record.last_accessed_at || record.created_at,
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Continue learning */}
            {data.recentRecords.length > 0 && (
              <>
                <SectionHeader title="继续学习" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-[22px]">
                  {data.recentRecords.slice(0, 4).map((record) => (
                    <VideoCard
                      key={record.id}
                      video={{
                        id: record.video_id,
                        title: record.video?.title || "未知视频",
                        thumbnail_url: record.video?.thumbnail_url ?? null,
                        duration: null,
                      }}
                      durationLabel={record.completed ? "已完成" : "继续"}
                      footer={
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <span>Speaking</span>
                          <span className="w-[3px] h-[3px] rounded-full bg-muted-soft" />
                          <span className="text-[11px] font-semibold text-body bg-surface-card px-2 py-0.5 rounded-pill">
                            {record.speaking_attempts > 0
                              ? `${record.speaking_attempts} 次跟读`
                              : "推荐"}
                          </span>
                        </div>
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="暂无学习数据，开始你的第一次练习吧！"
            action={<LinkButton href="/browse">浏览视频</LinkButton>}
          />
        )}
      </div>
    </main>
  );
}

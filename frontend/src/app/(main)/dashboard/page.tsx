"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import {
  FlameIcon,
  MicIcon,
  BookOpenIcon,
  ZapIcon,
  BarChart3Icon,
} from "@/components/common/Icons";
import { RotateCcw, Play } from "lucide-react";
import Link from "next/link";

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

interface SpeakingAttempt {
  id: string;
  subtitle_id: string;
  created_at: string;
  accuracy: number | null;
  fluency: number | null;
  completeness: number | null;
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
  attempts: SpeakingAttempt[];
  recentRecords: LearningRecord[];
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
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
  speaking: <MicIcon className="h-[15px] w-[15px] text-on-primary" />,
  vocabulary: <BookOpenIcon className="h-[15px] w-[15px] text-on-primary" />,
  quiz: <ZapIcon className="h-[15px] w-[15px] text-on-primary" />,
  watching: <BarChart3Icon className="h-[15px] w-[15px] text-on-primary" />,
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
      const [rawSpeakingStats, vocabStats, attemptsRes, recordsRes] = await Promise.all([
        api<SpeakingStats & { total_videos?: number }>("/api/v1/speaking/stats?period=all").catch(
          () => ({
            total_speaking_attempts: 0,
            average_accuracy: 0,
            average_fluency: 0,
            average_completeness: 0,
            total_vocabulary: 0,
            total_videos_watched: 0,
          })
        ),
        api<VocabStats>("/api/v1/vocabulary/stats").catch(() => ({
          total: 0,
          due_count: 0,
          learning_count: 0,
          mastered_count: 0,
        })),
        api<{ items: SpeakingAttempt[] }>("/api/v1/speaking/attempts?page=1&page_size=1000").catch(
          () => ({ items: [] })
        ),
        api<{ records: LearningRecord[] }>("/api/v1/learning/records?page=1&page_size=5").catch(
          () => ({ records: [] })
        ),
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
        attempts: attemptsRes.items,
        recentRecords: recordsRes.records,
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

  // Weekly activity from attempts
  const weeklyActivity = useMemo(() => {
    const today = new Date();
    const counts: number[] = Array(7).fill(0);
    if (!data?.attempts) return { labels: getPastWeekLabels(), counts, max: 1 };

    data.attempts.forEach((a) => {
      const d = new Date(a.created_at);
      const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
      if (diffDays >= 0 && diffDays < 7) {
        counts[6 - diffDays] += 1;
      }
    });

    return {
      labels: getPastWeekLabels(),
      counts,
      max: Math.max(...counts, 1),
    };
  }, [data?.attempts]);

  // Heatmap from attempts (past 35 days)
  const heatmapLevels = useMemo(() => {
    const today = new Date();
    const counts: number[] = Array(35).fill(0);
    if (!data?.attempts) return counts;

    data.attempts.forEach((a) => {
      const d = new Date(a.created_at);
      const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
      if (diffDays >= 0 && diffDays < 35) {
        counts[34 - diffDays] += 1;
      }
    });

    // Normalize to 0-4 levels based on max count
    const max = Math.max(...counts, 1);
    return counts.map((c) => {
      if (c === 0) return 0;
      if (c <= max * 0.25) return 1;
      if (c <= max * 0.5) return 2;
      if (c <= max * 0.75) return 3;
      return 4;
    });
  }, [data?.attempts]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </main>
    );
  }

  const userName = user?.name || "学习者";
  const streak = 0; // TODO: backend does not expose streak yet

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
              你已经连续学习 <b className="text-brand-500">{streak} 天</b>,继续保持!
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="btn-outline !py-2 !px-3"
            aria-label="刷新数据"
          >
            <RotateCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新
          </button>
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <BarChart3Icon className="h-12 w-12 mx-auto text-muted mb-4" />
            <p className="text-muted">加载数据失败，请稍后重试</p>
            <button onClick={loadData} className="btn-primary mt-4">
              重试
            </button>
          </div>
        ) : data ? (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-[18px] mb-6">
              <div className="dash-stat">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="dash-stat-icon bg-brand-50 text-brand-500">
                    <FlameIcon className="h-[19px] w-[19px]" />
                  </div>
                </div>
                <div className="dash-stat-num">{data.speakingStats.total_speaking_attempts}</div>
                <div className="dash-stat-label">口语练习次数</div>
              </div>
              <div className="dash-stat">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="dash-stat-icon bg-indigo-soft text-indigo">
                    <MicIcon className="h-[19px] w-[19px]" />
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
                    <BookOpenIcon className="h-[19px] w-[19px]" />
                  </div>
                </div>
                <div className="dash-stat-num">{data.vocabStats.total}</div>
                <div className="dash-stat-label">新增词汇</div>
              </div>
              <div className="dash-stat">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="dash-stat-icon bg-warning-soft text-warning">
                    <ZapIcon className="h-[19px] w-[19px]" />
                  </div>
                </div>
                <div className="dash-stat-num">{data.speakingStats.total_videos_watched}</div>
                <div className="dash-stat-label">已学视频</div>
              </div>
            </div>

            {/* Bar chart + Heatmap row */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-[18px] mb-6">
              {/* Bar chart */}
              <div className="bg-canvas border border-hairline rounded-lg p-6">
                <h3 className="!text-base !font-bold !m-0 !mb-1">本周口语练习</h3>
                <p className="text-[13px] text-muted !m-0 !mb-5">每日练习次数</p>
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
                        <div className="bar-label">{weeklyActivity.labels[i]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Heatmap */}
              <div className="bg-canvas border border-hairline rounded-lg p-6">
                <h3 className="!text-base !font-bold !m-0 !mb-1">学习热力图</h3>
                <p className="text-[13px] text-muted !m-0 !mb-5">过去 5 周</p>
                <div className="heat-grid">
                  {heatmapLevels.map((level, i) => (
                    <div
                      key={i}
                      className={cn(
                        "heat-cell",
                        level === 1 && "heat-l1",
                        level === 2 && "heat-l2",
                        level === 3 && "heat-l3",
                        level === 4 && "heat-l4"
                      )}
                      title={`${toISODate(new Date(Date.now() - (34 - i) * 86400000))}: ${level} 级活跃`}
                    />
                  ))}
                </div>
                <div className="heat-legend">
                  <span>少</span>
                  <div className="w-[11px] h-[11px] rounded-[3px] bg-surface-card inline-block" />
                  <div className="w-[11px] h-[11px] rounded-[3px] bg-brand-50 inline-block" />
                  <div className="w-[11px] h-[11px] rounded-[3px] bg-brand-100 inline-block" />
                  <div className="w-[11px] h-[11px] rounded-[3px] bg-brand-200 inline-block" />
                  <div className="w-[11px] h-[11px] rounded-[3px] bg-brand-500 inline-block" />
                  <span>多</span>
                </div>
              </div>
            </div>

            {/* Timeline */}
            {data.recentRecords.length > 0 && (
              <div className="bg-canvas border border-hairline rounded-lg p-6 mb-6">
                <h3 className="!text-base !font-bold !m-0 !mb-1">最近学习</h3>
                <p className="text-[13px] text-muted !m-0 !mb-5">你的学习时间线</p>
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
                      <ZapIcon className="h-[15px] w-[15px] text-on-primary" />
                    );
                    return (
                      <div key={record.id} className="tl-item">
                        <div className="tl-dot-line">
                          <div className={cn("tl-dot", color)}>{icon}</div>
                          {i < data.recentRecords.length - 1 && <div className="tl-line" />}
                        </div>
                        <div className="tl-body">
                          <Link
                            href={`/watch/${record.video_id}`}
                            className="tl-title hover:text-brand-500"
                          >
                            {record.video?.title || "未知视频"}
                          </Link>
                          <div className="tl-desc">
                            {record.speaking_attempts > 0 && `${record.speaking_attempts} 次跟读 `}
                            {record.words_learned > 0 && `${record.words_learned} 个生词 `}
                            {record.completed && <span className="text-success">· 已完成</span>}
                          </div>
                          <div className="tl-time">
                            {timeAgo(record.last_accessed_at || record.created_at)}
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
                <div className="sec-head">
                  <h2 className="sec-title">继续学习</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-[22px]">
                  {data.recentRecords.slice(0, 4).map((record) => (
                    <Link
                      key={record.id}
                      href={`/watch/${record.video_id}`}
                      className="vcard group"
                    >
                      <div className="thumb">
                        {record.video?.thumbnail_url ? (
                          <img
                            src={record.video.thumbnail_url}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-surface-card flex items-center justify-center">
                            <Play className="h-8 w-8 text-muted-soft" />
                          </div>
                        )}
                        <span className="thumb-dur">{record.completed ? "已完成" : "继续"}</span>
                        <div className="thumb-play">
                          <div className="thumb-play-btn">
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="#fff"
                              stroke="none"
                            >
                              <path d="M6 4l14 8-14 8V4Z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <div className="vmeta">
                        <p className="vtitle">{record.video?.title || "未知视频"}</p>
                        <div className="vfoot">
                          <span>Speaking</span>
                          <span className="vdot" />
                          <span className="chip">
                            {record.speaking_attempts > 0
                              ? `${record.speaking_attempts} 次跟读`
                              : "推荐"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="py-20 text-center">
            <BarChart3Icon className="h-12 w-12 mx-auto text-muted mb-4" />
            <p className="text-muted">暂无学习数据，开始你的第一次练习吧！</p>
            <Link href="/browse" className="btn-primary mt-4 inline-flex">
              浏览视频
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

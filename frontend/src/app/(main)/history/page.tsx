"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/common/Icons";
import ActivityHeatmap from "@/components/dashboard/ActivityHeatmap";
import type { ActivityCalendar, LearningRecord } from "@/types";

export default function HistoryPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [loading, setLoading] = useState(true);

  // Month navigation
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [activityCalendar, setActivityCalendar] =
    useState<ActivityCalendar | null>(null);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
  }, [isAuthenticated, isLoading, router]);

  // Fetch activity calendar
  useEffect(() => {
    (async () => {
      try {
        const data = await api<ActivityCalendar>(
          `/api/v1/users/me/activity?year=${year}&month=${month}`,
        );
        setActivityCalendar(data);
      } catch {
        toast.error("加载活动数据失败");
      }
    })();
  }, [year, month]);

  // Fetch learning records
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api<{ records: LearningRecord[]; total: number }>(
          `/api/v1/learning/records?page=${recordsPage}&page_size=20`,
        );
        setRecords(data.records);
        setHasMore(data.total > recordsPage * 20);
      } catch {
        toast.error("加载学习记录失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [recordsPage]);

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  }

  const monthNames = [
    "",
    "一月",
    "二月",
    "三月",
    "四月",
    "五月",
    "六月",
    "七月",
    "八月",
    "九月",
    "十月",
    "十一月",
    "十二月",
  ];

  return (
    <main className="min-h-full bg-canvas">
      {/* Header */}
      <section className="border-b border-hairline bg-canvas">
        <div className="container-page py-8 sm:py-12">
          <div className="flex items-center gap-2 text-coral mb-3">
            <CalendarIcon className="h-[18px] w-[18px]" />
            <span className="text-xs font-semibold tracking-caption-wide uppercase">
              学习历史
            </span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-normal text-ink tracking-display-xl leading-tight">
            学习记录
          </h1>
        </div>
      </section>

      <div className="container-page py-8 space-y-8">
        {/* Month navigator + Activity heatmap */}
        <Card padding={5}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-caption-wide text-muted-foreground">
              学习日历
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-cream-soft transition-colors"
              >
                <ChevronLeftIcon className="h-4 w-4 text-ink" />
              </button>
              <span className="text-sm font-medium text-ink min-w-[100px] text-center">
                {year} 年 {monthNames[month]}
              </span>
              <button
                onClick={nextMonth}
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-cream-soft transition-colors"
              >
                <ChevronRightIcon className="h-4 w-4 text-ink" />
              </button>
            </div>
          </div>
          {activityCalendar ? (
            <ActivityHeatmap
              activities={activityCalendar.activities}
              year={year}
              month={month}
            />
          ) : (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-coral" />
            </div>
          )}
        </Card>

        {/* Learning records list */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-caption-wide text-muted-foreground mb-4">
            视频学习记录
          </h3>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-coral" />
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarIcon className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">暂无学习记录</p>
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <a
                  key={record.id}
                  href={`/watch/${record.video_id}`}
                  className="flex items-center gap-4 p-4 rounded-lg border border-hairline bg-canvas hover:bg-cream-soft transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="h-12 w-20 rounded-md bg-cream-card overflow-hidden flex-shrink-0">
                    {record.video?.thumbnail_url ? (
                      <img
                        src={record.video.thumbnail_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-lg">
                        🎬
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {record.video?.title || "未知视频"}
                    </p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>{record.speaking_attempts} 次跟读</span>
                      <span>{record.words_learned} 个生词</span>
                      {record.quiz_score !== null && (
                        <span>测验 {Math.round(record.quiz_score)} 分</span>
                      )}
                      {record.completed && (
                        <span className="text-green-600">✓ 已完成</span>
                      )}
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="w-20">
                      <div className="h-1.5 rounded-full bg-cream-card">
                        <div
                          className="h-full rounded-full bg-coral transition-all"
                          style={{
                            width: `${Math.min(record.progress_percentage, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {Math.round(record.progress_percentage)}%
                    </span>
                  </div>
                </a>
              ))}

              {/* Pagination */}
              <div className="flex justify-center gap-3 pt-4">
                {recordsPage > 1 && (
                  <Button
                    onClick={() => setRecordsPage(recordsPage - 1)}
                    variant="secondary"
                    size="sm"
                  >
                    上一页
                  </Button>
                )}
                {hasMore && (
                  <Button
                    onClick={() => setRecordsPage(recordsPage + 1)}
                    variant="secondary"
                    size="sm"
                  >
                    下一页
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

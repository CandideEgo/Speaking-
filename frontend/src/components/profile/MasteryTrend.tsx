"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ErrorState } from "@/components/common/ErrorState";
import { TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type { MasteryTrendResponse } from "@/types";
import type { TrendDataPoint } from "./MasteryTrendChart";

// recharts is heavy (~100KB+ gzip) — load the chart module only when data
// is ready, keeping it out of the profile page's initial bundle.
const MasteryTrendChart = dynamic(
  () => import("./MasteryTrendChart").then((m) => m.MasteryTrendChart),
  { ssr: false }
);

export type { TrendDataPoint };

/**
 * MasteryTrend — line chart showing vocabulary mastery progression over time.
 * Fetches snapshots from GET /plan/mastery-trend?weeks=N
 */
export function MasteryTrend({ weeks = 8 }: { weeks?: number }) {
  const [data, setData] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function fetchTrend() {
      setError(false);
      try {
        const res = await api<MasteryTrendResponse>(`/api/v1/plan/mastery-trend?weeks=${weeks}`);
        if (cancelled) return;

        const points: TrendDataPoint[] = res.snapshots.map((s) => {
          // Aggregate across all exam levels
          let newCount = 0;
          let learningCount = 0;
          let masteredCount = 0;
          let total = 0;

          if (s.mastery_json) {
            for (const level of Object.values(s.mastery_json)) {
              newCount += level.new ?? 0;
              learningCount += (level.learning ?? 0) + (level.reviewing ?? 0);
              masteredCount += level.mastered ?? 0;
              total += level.total ?? 0;
            }
          }

          const d = new Date(s.date);
          return {
            date: s.date,
            label: `${d.getMonth() + 1}/${d.getDate()}`,
            newWords: newCount,
            learning: learningCount,
            mastered: masteredCount,
            total,
          };
        });

        setData(points);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTrend();
    return () => {
      cancelled = true;
    };
  }, [weeks, attempt]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-copy text-muted">加载中...</div>
    );
  }

  if (error)
    return <ErrorState title="学习趋势未能加载" onRetry={() => setAttempt((n) => n + 1)} />;

  if (data.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted">
        <TrendingUp size={24} className="opacity-40" />
        <p className="text-copy">暂无足够数据，继续学习以生成趋势图</p>
      </div>
    );
  }

  return <MasteryTrendChart data={data} />;
}

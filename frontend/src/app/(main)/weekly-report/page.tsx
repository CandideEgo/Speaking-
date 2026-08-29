"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Button } from "@/components/ui/Button";
import { ShareCard } from "@/components/weekly/ShareCard";
import { CalendarRange, Download, Sparkles } from "lucide-react";
import { useChartTheme } from "@/lib/chart-theme";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface WeeklyReportPayload {
  id: string;
  week_start: string;
  study_days: number;
  total_minutes: number;
  new_words: number;
  reviewed_words: number;
  videos_completed: number;
  streak_at_week_end: number;
  delta_minutes_pct: number | null;
  daily_minutes: { date: string; minutes: number }[];
  daily_new_words: { date: string; words: number }[];
  highlight: string | null;
  created_at: string | null;
}

interface WeeklyListResponse {
  items: WeeklyReportPayload[];
  page: number;
  page_size: number;
  total: number;
}

function formatRange(mondayIso: string): string {
  const mon = new Date(mondayIso + "T00:00:00Z");
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const f = (d: Date) => `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
  return `${f(mon)} – ${f(sun)}`;
}

const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export default function WeeklyReportPage() {
  const chartTheme = useChartTheme();
  const [report, setReport] = useState<WeeklyReportPayload | null>(null);
  const [history, setHistory] = useState<WeeklyReportPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noReportYet, setNoReportYet] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 词汇增长曲线：每日新词累计（recharts 面积图）
  const wordCurve = useMemo(() => {
    if (!report) return [];
    let acc = 0;
    return report.daily_new_words.map((d, i) => {
      acc += d.words;
      return { day: DAY_LABELS[i] ?? "", total: acc };
    });
  }, [report]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const latest = await api<WeeklyReportPayload>("/api/v1/learning/weekly-reports/latest");
      setReport(latest);
      setNoReportYet(false);
      // 历史列表（去掉最新一期，避免重复）
      try {
        const list = await api<WeeklyListResponse>(
          "/api/v1/learning/weekly-reports?page=1&page_size=10"
        );
        setHistory(list.items.filter((r) => r.id !== latest.id));
      } catch {
        setHistory([]);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNoReportYet(true);
      } else {
        setError("周报加载失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function saveImage() {
    const canvas = canvasRef.current;
    if (!canvas || !report) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `seeword-weekly-${report.week_start}.png`;
    a.click();
  }

  const stats = report
    ? [
        { label: "学习天数", value: report.study_days, unit: "天" },
        { label: "新学词汇", value: report.new_words, unit: "词" },
        { label: "观看视频", value: report.videos_completed, unit: "个" },
        { label: "学习时长", value: report.total_minutes, unit: "分钟" },
      ]
    : [];

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-10">
        <PageHeader crumb="我的" title="学习周报" />

        {loading && (
          <div className="max-w-2xl space-y-4">
            <div className="h-24 rounded-xl bg-surface-soft animate-pulse" />
            <div className="h-64 rounded-xl bg-surface-soft animate-pulse" />
          </div>
        )}

        {!loading && error && <ErrorState title={error} onRetry={load} className="py-8" />}

        {/* 不足一周：空状态（每扇关闭的门都留一扇窗） */}
        {!loading && !error && noReportYet && (
          <EmptyState
            icon={CalendarRange}
            title="学习满一周后生成报告"
            description="周报每周一早上自动生成，回顾你的学习数据并可以分享给朋友。"
            action={
              <Link
                href="/browse"
                className="inline-flex items-center px-5 py-2.5 rounded-md bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
              >
                去看视频
              </Link>
            }
          />
        )}

        {!loading && !error && report && (
          <div className="max-w-2xl space-y-8">
            {/* ── 周报头部：周范围 + 环比 ── */}
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="text-lg font-bold text-ink">{formatRange(report.week_start)}</h2>
              {/* 首周不显示环比箭头 */}
              {report.delta_minutes_pct !== null && (
                <span
                  className={
                    "text-xs font-semibold " +
                    (report.delta_minutes_pct >= 0 ? "text-success" : "text-error")
                  }
                >
                  {report.delta_minutes_pct >= 0 ? "↑" : "↓"} {Math.abs(report.delta_minutes_pct)}%
                  vs 上周
                </span>
              )}
            </div>

            {/* ── 概览大数字（0 也显示，真实反馈） ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="bg-canvas border border-hairline rounded-xl p-4 text-center"
                >
                  <div className="text-3xl font-extrabold text-brand-500 tabular-nums">
                    {s.value}
                  </div>
                  <div className="text-[11px] text-muted mt-1">
                    {s.label} · {s.unit}
                  </div>
                </div>
              ))}
            </div>

            {/* ── 7 天热力条 ── */}
            <div className="bg-canvas border border-hairline rounded-xl p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">每日学习时长</h3>
              <div className="flex items-end gap-1.5 h-20">
                {report.daily_minutes.map((d, i) => {
                  const max = Math.max(1, ...report.daily_minutes.map((x) => x.minutes));
                  const h = (d.minutes / max) * 100;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-brand-500 rounded-t"
                        style={{ height: h + "%", minHeight: 2 }}
                        title={d.date + " · " + d.minutes + " 分钟"}
                      />
                      <span className="text-[9px] text-muted-soft">{DAY_LABELS[i] ?? ""}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 词汇增长曲线（本周新词累计） ── */}
            <div className="bg-canvas border border-hairline rounded-xl p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">词汇增长</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={wordCurve} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: chartTheme.tick }}
                      axisLine={{ stroke: chartTheme.axis }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTheme.tick }}
                      axisLine={{ stroke: chartTheme.axis }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={chartTheme.tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="累计新词"
                      stroke={chartTheme.series.brand}
                      fill={chartTheme.series.brand}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── 本周亮点 ── */}
            <div className="flex items-center gap-3 rounded-xl border border-brand-500/20 bg-brand-500/5 px-5 py-4">
              <Sparkles size={18} className="text-brand-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-ink">{report.highlight ?? "坚持就是胜利"}</p>
            </div>

            {/* ── 分享卡片 ── */}
            <div>
              <h3 className="text-sm font-semibold text-ink mb-4">分享卡片</h3>
              <div className="max-w-[320px] mx-auto">
                <ShareCard report={report} onReady={(c) => (canvasRef.current = c)} />
              </div>
              <div className="mt-4 flex justify-center">
                <Button onClick={saveImage} icon={Download}>
                  保存图片
                </Button>
              </div>
            </div>

            {/* ── 历史周报 ── */}
            {history.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-ink mb-4">历史周报</h3>
                <ul className="space-y-2">
                  {history.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between bg-canvas border border-hairline rounded-lg px-4 py-3 text-sm"
                    >
                      <span className="text-ink font-medium">{formatRange(r.week_start)}</span>
                      <span className="text-muted text-xs">
                        {r.study_days} 天 · {r.total_minutes} 分钟 · 新学 {r.new_words} 词
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>
    </PageTransition>
  );
}

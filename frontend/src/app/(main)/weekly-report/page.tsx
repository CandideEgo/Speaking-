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
import { CalendarRange, Download, Sparkles, ArrowRight } from "lucide-react";
import { useChartTheme } from "@/lib/chart-theme";
import { Card } from "@/components/ui/Card";
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

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
}

function weekdayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return names[d.getUTCDay()] ?? "";
}

const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

interface Suggestion {
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}

/**
 * 下周建议：全部由页面上的本周数据派生，不做分数/等级预测。
 * 设计稿「下周可以这样安排」3 条，每条都带一个能点进去的下一步。
 */
function buildSuggestions(report: WeeklyReportPayload): Suggestion[] {
  const days = report.daily_minutes ?? [];
  const lightest = days.length
    ? days.reduce((a, b) => (b.minutes < a.minutes ? b : a), days[0])
    : null;
  const list: Suggestion[] = [];

  if (lightest) {
    list.push({
      title: `${weekdayLabel(lightest.date)}只有 ${lightest.minutes} 分钟，把提醒放到 20:30，别让最轻的一天变成断点`,
      body: `本周 ${report.study_days} 天有学习记录，最轻的一天是 ${shortDate(lightest.date)}（${lightest.minutes} 分钟）。在学习设置里可以打开每日提醒，提醒每天只发一次；连续学习现在是 ${report.streak_at_week_end} 天。`,
      href: "/profile?tab=settings",
      linkLabel: "去改提醒时间",
    });
  }

  if (report.reviewed_words > 0) {
    list.push({
      title: `本周复习了 ${report.reviewed_words} 个词次，回词汇页把到期词放回上下文`,
      body: `新学 ${report.new_words} 个词、复习 ${report.reviewed_words} 个词次。先去词汇页看今天到期的词，再回到视频里跟读一遍，比只看释义更容易记住。`,
      href: "/vocabulary",
      linkLabel: "去复习",
    });
  } else {
    list.push({
      title: `本周新学 ${report.new_words} 个词，做一次词汇复习把它们留住`,
      body: `这周新学 ${report.new_words} 个词，还没有复习记录。加入词库的词会按到期时间排队，做完一次复习才算真正记住。`,
      href: "/vocabulary",
      linkLabel: "去词汇页",
    });
  }

  list.push({
    title: `本周看完 ${report.videos_completed} 个视频，继续在真实语境里积累`,
    body: `这周学习 ${report.total_minutes} 分钟、有 ${report.study_days} 天打开过学习页。挑一段 15 分钟以内的视频更容易坚持，点词查义会自动进词库。`,
    href: "/",
    linkLabel: "继续看视频",
  });

  return list;
}

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
        {
          label: "学习时长",
          value: report.total_minutes,
          unit: "分钟",
          note: "观看 + 复习 + 练习；暂停与挂机不计入",
        },
        {
          label: "复习词数",
          value: report.reviewed_words,
          unit: "词",
          note: "完成一次复习并作答的词次；同词两次算两次",
        },
        {
          label: "新学词汇",
          value: report.new_words,
          unit: "词",
          note: "本周首次加入词库的词",
        },
        {
          label: "看完视频",
          value: report.videos_completed,
          unit: "个",
          note: "完整看完的视频数（与「打开过的段数」不同）",
        },
      ]
    : [];

  const suggestions = report ? buildSuggestions(report) : [];
  const dayMax = Math.max(1, ...(report?.daily_minutes ?? []).map((d) => d.minutes));

  return (
    <PageTransition>
      <main className="pt-6 pb-18">
        <PageHeader
          crumb="我的 · 周报"
          title={report ? `学习周报：${formatRange(report.week_start)}` : "学习周报"}
          description="每周回顾学习时长、词汇积累与练习表现。"
          actions={
            report ? (
              <Button onClick={saveImage} icon={Download}>
                保存分享卡
              </Button>
            ) : undefined
          }
        />

        {/* 本周 context（设计稿 acct-context：本周学习 / 连续 / 比上周） */}
        {report && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted">
            <span>
              本周学习{" "}
              <strong className="font-semibold text-ink">
                {(report.total_minutes / 60).toFixed(1)} 小时
              </strong>
            </span>
            <span aria-hidden>·</span>
            <span>
              连续 <strong className="font-semibold text-ink">{report.streak_at_week_end}</strong>{" "}
              天
            </span>
            {report.delta_minutes_pct !== null && (
              <>
                <span aria-hidden>·</span>
                <span>
                  比上周{" "}
                  <strong
                    className={
                      "font-semibold " +
                      (report.delta_minutes_pct >= 0 ? "text-success-text" : "text-error-text")
                    }
                  >
                    {report.delta_minutes_pct >= 0 ? "+" : "-"}
                    {Math.abs(report.delta_minutes_pct)}%
                  </strong>
                </span>
              </>
            )}
          </div>
        )}

        {loading && (
          <div className="mt-6 max-w-2xl space-y-4">
            <div className="h-24 rounded-lg bg-surface-soft animate-pulse" />
            <div className="h-64 rounded-lg bg-surface-soft animate-pulse" />
          </div>
        )}

        {!loading && error && <ErrorState title={error} onRetry={load} className="py-8" />}

        {/* 不足一周：空状态（每扇关闭的门都留一扇窗） */}
        {!loading && !error && noReportYet && (
          <div className="mt-6">
            <EmptyState
              icon={CalendarRange}
              title="学习满一周后生成报告"
              description="周报每周一早上自动生成，回顾上一自然周；不足一周不会有半份报告。现在可以先做这些："
              action={
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 rounded-sm bg-brand-500 px-5 py-2.5 text-copy font-semibold text-white transition-colors hover:bg-brand-600"
                  >
                    去挑一段视频
                  </Link>
                  <Link
                    href="/vocabulary"
                    className="inline-flex items-center gap-1 text-copy font-semibold text-brand-700 hover:underline"
                  >
                    复习今天到期的词
                    <ArrowRight size={14} />
                  </Link>
                  <Link
                    href="/history"
                    className="inline-flex items-center gap-1 text-copy font-semibold text-brand-700 hover:underline"
                  >
                    看学习记录
                    <ArrowRight size={14} />
                  </Link>
                </div>
              }
            />
            <p className="mt-2 text-center text-meta text-muted">
              周报生成后会发一条站内通知；也可以在账户页把「周报生成通知」关掉。
            </p>
          </div>
        )}

        {!loading && !error && report && (
          <div className="user-page-layout has-aside">
            <div className="user-page-main">
              {/* ── 本周概览：4 个数字都带口径 ── */}
              <section>
                <div className="user-sec-head">
                  <div>
                    <h2 className="user-sec-title">本周概览</h2>
                    <p className="user-sec-sub mt-1">这一周，你积累了多少？</p>
                  </div>
                </div>
                <div className="user-stat-grid mt-4">
                  {stats.map((s) => (
                    <div key={s.label} className="user-stat">
                      <p className="user-stat-num tabular-nums">
                        {s.value}
                        <span className="ml-1 text-meta font-semibold text-muted">{s.unit}</span>
                      </p>
                      <p className="user-stat-label">{s.label}</p>
                      <p className="text-caption leading-relaxed text-muted">{s.note}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── 每日分布：柱状图 + 明细表 ── */}
              <section>
                <div className="user-sec-head">
                  <div>
                    <h2 className="user-sec-title">每日分布</h2>
                    <p className="user-sec-sub mt-1">
                      7 天里的学习时长与新学词汇；最轻的一天也照实画，不补记。
                    </p>
                  </div>
                </div>
                <Card padding={5} className="mt-4">
                  <h3 className="text-copy font-semibold text-ink">每天的学习时长（分钟）</h3>
                  <div
                    className="mt-4 flex items-end gap-1.5"
                    role="img"
                    aria-label="本周每天学习时长柱状图，单位分钟"
                  >
                    {report.daily_minutes.map((d, i) => {
                      const h = (d.minutes / dayMax) * 100;
                      const isPeak = d.minutes === dayMax && d.minutes > 0;
                      return (
                        <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                          <span className="text-caption text-muted tabular-nums">{d.minutes}</span>
                          {/* 固定高度的柱区：百分比高度必须有确定基准，否则解析为 0（曾经只剩 2px 基线）。 */}
                          <div className="flex h-24 w-full items-end">
                            <div
                              className={
                                "w-full rounded-t-md " +
                                (isPeak ? "bg-brand-500" : "bg-hairline-strong")
                              }
                              style={{ height: `${h}%`, minHeight: 2 }}
                              title={d.date + " · " + d.minutes + " 分钟"}
                            />
                          </div>
                          <span className="text-caption text-muted">{DAY_LABELS[i] ?? ""}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-meta text-muted">
                    柱高按本周最大值等比缩放；最短的一天也照实画，不抹平差异。
                  </p>

                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-copy">
                      <caption className="sr-only">每天明细：日期、学习时长与新学词汇</caption>
                      <thead>
                        <tr className="border-b border-hairline-soft text-left text-meta text-muted">
                          <th scope="col" className="py-2 pr-3 font-medium">
                            日期
                          </th>
                          <th scope="col" className="py-2 pr-3 text-right font-medium">
                            学习时长
                          </th>
                          <th scope="col" className="py-2 pr-3 text-right font-medium">
                            新学词汇
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.daily_minutes.map((d, i) => {
                          const words = report.daily_new_words[i]?.words ?? 0;
                          return (
                            <tr key={d.date} className="border-b border-hairline-soft">
                              <td className="py-2 pr-3 text-ink">
                                {shortDate(d.date)}（{DAY_LABELS[i] ?? ""}）
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums text-ink">
                                {d.minutes} 分钟
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums text-ink">
                                {words} 词
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </section>

              {/* ── 下周可以这样安排：3 条建议，每条都能点进去做 ── */}
              <section>
                <div className="user-sec-head">
                  <div>
                    <h2 className="user-sec-title">下周可以这样安排</h2>
                    <p className="user-sec-sub mt-1">根据本周表现，选择适合自己的下一步。</p>
                  </div>
                </div>
                <ol className="mt-4 space-y-3">
                  {suggestions.map((s, i) => (
                    <li key={s.title} className="flex gap-3">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-pill bg-surface-soft text-caption font-semibold text-ink">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-copy font-semibold text-ink">{s.title}</p>
                        <p className="mt-1 text-meta leading-relaxed text-muted">{s.body}</p>
                        <Link
                          href={s.href}
                          className="mt-1 inline-flex items-center gap-1 text-meta font-semibold text-brand-700 hover:underline"
                        >
                          {s.linkLabel}
                          <ArrowRight size={13} />
                        </Link>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {/* ── 词汇增长曲线（本周新词累计，产品增项） ── */}
              <section>
                <div className="user-sec-head">
                  <div>
                    <h2 className="user-sec-title">词汇增长</h2>
                    <p className="user-sec-sub mt-1">本周每天新学词汇的累计曲线。</p>
                  </div>
                </div>
                <Card padding={5} className="mt-4">
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={wordCurve}
                        margin={{ top: 8, right: 8, bottom: 0, left: -22 }}
                      >
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
                </Card>
              </section>

              {/* ── 本周亮点 ── */}
              <div className="flex items-center gap-3 rounded-lg border border-brand-500/20 bg-brand-500/5 px-5 py-4">
                <Sparkles size={18} className="text-brand-700 flex-shrink-0" />
                <p className="text-copy font-semibold text-ink">
                  {report.highlight ?? "坚持就是胜利"}
                </p>
              </div>

              {/* ── 分享卡片 ── */}
              <section>
                <div className="user-sec-head">
                  <div>
                    <h2 className="user-sec-title">分享卡</h2>
                    <p className="user-sec-sub mt-1">
                      canvas 生成的 1080×1920 竖图，带注册二维码；用页头的「保存分享卡」下载。
                    </p>
                  </div>
                </div>
                <div className="mx-auto mt-4 max-w-[320px]">
                  <ShareCard report={report} onReady={(c) => (canvasRef.current = c)} />
                </div>
              </section>

              {/* ── 历史周报 ── */}
              {history.length > 0 && (
                <section>
                  <div className="user-sec-head">
                    <div>
                      <h2 className="user-sec-title">历史周报</h2>
                      <p className="user-sec-sub mt-1">每周一生成一期，最多保留最近 10 期。</p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {history.map((r) => (
                      <Card
                        as="li"
                        key={r.id}
                        padding={0}
                        className="flex items-center justify-between px-4 py-3 text-copy"
                      >
                        <span className="text-ink font-medium">{formatRange(r.week_start)}</span>
                        <span className="text-muted text-meta">
                          {r.study_days} 天 · {r.total_minutes} 分钟 · 新学 {r.new_words} 词
                        </span>
                      </Card>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <aside className="user-page-aside">
              <section className="user-aside-sec">
                <h2 className="user-aside-title">统计说明</h2>
                <ul className="user-kv">
                  <li className="user-kv-row">
                    <span className="user-kv-key">周范围</span>
                    <span className="user-kv-val">周一 00:00 – 周日 23:59</span>
                  </li>
                  <li className="user-kv-row">
                    <span className="user-kv-key">时区</span>
                    <span className="user-kv-val">账号设置里的时区</span>
                  </li>
                  <li className="user-kv-row">
                    <span className="user-kv-key">学习时长</span>
                    <span className="user-kv-val">播放 + 复习 + 练习</span>
                  </li>
                  <li className="user-kv-row">
                    <span className="user-kv-key">复习词数</span>
                    <span className="user-kv-val">按词次计</span>
                  </li>
                  <li className="user-kv-row">
                    <span className="user-kv-key">新学词汇</span>
                    <span className="user-kv-val">本周首次入词库</span>
                  </li>
                </ul>
              </section>

              <section className="user-aside-sec">
                <h2 className="user-aside-title">相关页面</h2>
                <ul className="space-y-2">
                  <li>
                    <Link
                      href="/profile"
                      className="inline-flex items-center gap-1 text-copy font-semibold text-brand-700 hover:underline"
                    >
                      我的账户与设置
                      <ArrowRight size={14} />
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/history"
                      className="inline-flex items-center gap-1 text-copy font-semibold text-brand-700 hover:underline"
                    >
                      学习记录
                      <ArrowRight size={14} />
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/vocabulary"
                      className="inline-flex items-center gap-1 text-copy font-semibold text-brand-700 hover:underline"
                    >
                      词汇与复习
                      <ArrowRight size={14} />
                    </Link>
                  </li>
                </ul>
              </section>
            </aside>
          </div>
        )}
      </main>
    </PageTransition>
  );
}

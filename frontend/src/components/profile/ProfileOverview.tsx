"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, Flame } from "lucide-react";

import { ErrorState } from "@/components/common/ErrorState";
import { Skeleton } from "@/components/common/SkeletonCard";
import { api } from "@/lib/api";

interface Overview {
  streak: { current: number; longest: number };
  learning: { days_studied: number; total_minutes: number; estimated_level: string | null };
  this_week: {
    minutes: number;
    days_active: number;
    daily: { date: string; minutes: number; active?: boolean }[];
  };
  words: {
    total: number;
    mastered_count: number;
    due_review_count: number;
    new_count: number;
  };
  exams: { attempts: number; last_submitted_at: string | null };
}

/**
 * 我的概览：四张学习资产卡 + 最近学习 + 7 天节奏。
 *
 * 数字全部来自 `GET /users/me/overview`（streak / 累计分钟 / 词汇汇总），
 * 不再由页面各自拼五个端点。没有记录时显示 0，而不是演示数字。
 */
export function ProfileOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    api<Overview>("/api/v1/users/me/overview", { signal: controller.signal })
      .then((payload) => {
        if (!controller.signal.aborted) setData(payload);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);

  if (error)
    return <ErrorState title="学习概览未能加载" onRetry={() => setAttempt((n) => n + 1)} />;
  if (!data)
    return (
      <div aria-busy="true" className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );

  const assets = [
    {
      key: "words",
      label: "全部词汇",
      value: data?.words?.total ?? 0,
      hint: data?.words ? `${data.words.due_review_count} 个今天到期` : "—",
      href: "/vocabulary",
      icon: BookOpen,
    },
    {
      key: "mastered",
      label: "已掌握",
      value: data?.words?.mastered_count ?? 0,
      hint: "复习间隔已拉长",
      href: "/vocabulary",
      icon: CheckCircle2,
    },
    {
      key: "days",
      label: "学习天数",
      value: data?.learning?.days_studied ?? 0,
      hint: data?.learning ? `累计 ${data.learning.total_minutes} 分钟` : "—",
      href: "/history",
      icon: Clock3,
    },
    {
      key: "week",
      label: "本周学习",
      value: data?.this_week?.minutes ?? 0,
      hint: data?.this_week ? `${data.this_week.days_active} 天有记录` : "—",
      href: "/history",
      icon: Flame,
    },
  ];

  return (
    <section aria-label="学习资产" className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {assets.map((asset) => (
          <Link
            key={asset.key}
            href={asset.href}
            className="rounded-md border border-hairline bg-canvas p-3.5 transition-colors hover:border-hairline-strong"
          >
            <span className="flex items-center gap-1.5 text-caption text-muted">
              <asset.icon size={13} aria-hidden />
              {asset.label}
            </span>
            <span className="mt-1.5 block text-[1.75rem] font-semibold leading-none tabular-nums text-ink">
              {asset.value}
            </span>
            <span className="mt-1 block text-caption text-muted">{asset.hint}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Link
          href="/history"
          className="flex items-center justify-between rounded-md border border-hairline bg-canvas px-4 py-3 hover:bg-surface-soft"
        >
          <span>
            <span className="block text-copy font-semibold text-ink">最近学习</span>
            <span className="mt-0.5 block text-meta text-muted">
              {data?.streak && data?.this_week
                ? `连续 ${data.streak.current} 天 · 本周 ${data.this_week.minutes} 分钟`
                : "读取中…"}
            </span>
          </span>
          <ArrowRight size={16} className="text-muted" aria-hidden />
        </Link>
        <div className="rounded-md border border-hairline bg-canvas px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-copy font-semibold text-ink">学习节奏</span>
            <span className="text-caption text-muted">本周</span>
          </div>
          {!data ? (
            <div className="mt-2.5 h-2 rounded-pill bg-surface-card" aria-hidden />
          ) : (data.this_week?.daily ?? []).some((day) => day.active ?? day.minutes > 0) ? (
            <div className="mt-2.5 flex gap-1.5">
              {(data.this_week?.daily ?? []).map((day, index) => (
                <span
                  key={`${day.date}-${index}`}
                  title={day.date ? `${day.date} · ${day.minutes} 分钟` : undefined}
                  className={`h-2 flex-1 rounded-pill ${(day.active ?? day.minutes > 0) ? "bg-brand-500" : "bg-surface-card"}`}
                />
              ))}
            </div>
          ) : (
            // 七天全空时一排灰条什么也没说明，直接说「还没有记录」。
            <p className="mt-2 text-meta text-muted">
              本周还没有学习记录，看一段视频就会出现在这里。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";

/**
 * CompactStatsBar — 首页紧凑统计行（D3a，产品设计规划 §3.3）。
 *
 * 取代原「今日已完成 N/M」进度环：只展示事实（连续天数/词汇量/已学视频），
 * 不派任务、不施压。三项事实各是一条去处的入口（S7-2）；右侧 CTA 有到期词时
 * 是「开始复习」（便利入口，不是任务），没有时给「去练习」——零到期词的账号
 * 首屏也得有可点的主行动（统计未到位时不猜，两边都不渲染）。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, BookOpen, Clapperboard, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { usePlan } from "@/hooks/usePlan";
import { Card } from "@/components/ui/Card";

interface VocabStats {
  total: number;
  due_count: number;
}

/**
 * `band`（默认）= 首页原来那条整宽统计卡；`inline` = DEC-080 的头部附属形态 ——
 * 不渲染 Card 外框，三项事实 + CTA 折成一行，跟问候语并排。数据与入口两档完全一致。
 */
export function CompactStatsBar({ variant = "band" }: { variant?: "band" | "inline" }) {
  const { profile } = usePlan();
  const [vocabStats, setVocabStats] = useState<VocabStats | null>(null);
  const [recordsTotal, setRecordsTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api<VocabStats>("/api/v1/vocabulary/stats"),
      api<{ total?: number }>("/api/v1/learning/records?page=1&page_size=1"),
    ]).then(([vs, rec]) => {
      if (cancelled) return;
      if (vs.status === "fulfilled") setVocabStats(vs.value);
      if (rec.status === "fulfilled") setRecordsTotal(rec.value.total ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 统计未到位时不猜：三项都显示 `–`，只有拿到真值才显示 0（BUG-04 ——
  // 原先 `?? 0` 让「没加载出来」和「真的 0 天连续」长得一模一样）。
  const streak = profile ? profile.current_streak : null;
  const dueCount = vocabStats?.due_count ?? 0;

  const facts = (
    <>
      <Link
        href="/profile"
        className="inline-flex items-center gap-1.5 text-copy font-semibold text-ink whitespace-nowrap transition-colors hover:text-brand-600"
        title="连续学习天数"
      >
        <Flame size={15} className={(streak ?? 0) > 0 ? "text-brand-500" : "text-muted-soft"} />
        {streak !== null ? `${streak} 天连续` : "–"}
      </Link>
      <Link
        href="/vocabulary"
        className="inline-flex items-center gap-1.5 text-copy font-semibold text-ink whitespace-nowrap transition-colors hover:text-brand-600"
        title="词库总词数"
      >
        <BookOpen size={15} className="text-muted" />
        {vocabStats ? `${vocabStats.total} 个词` : "–"}
      </Link>
      <Link
        href="/history"
        className="inline-flex items-center gap-1.5 text-copy font-semibold text-ink whitespace-nowrap transition-colors hover:text-brand-600"
        title="已学视频数"
      >
        <Clapperboard size={15} className="text-muted" />
        {recordsTotal !== null ? `${recordsTotal} 个视频` : "–"}
      </Link>
    </>
  );

  {
    /* 便利入口：有到期词 → 开始复习；没有 → 去练习。统计未到位时两边都不渲染，不猜 */
  }
  const cta =
    vocabStats !== null ? (
      dueCount > 0 ? (
        <Link
          href="/vocabulary/drill"
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-500 px-3.5 py-1.5 text-copy font-semibold text-white transition-colors hover:bg-brand-600"
        >
          开始复习
          <ArrowRight size={13} />
        </Link>
      ) : (
        <Link
          href="/practice"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-hairline px-3.5 py-1.5 text-copy font-semibold text-ink transition-colors hover:border-muted-soft"
        >
          去练习
          <ArrowRight size={13} />
        </Link>
      )
    ) : null;

  if (variant === "inline") {
    return (
      <div
        data-testid="compact-stats-inline"
        className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2"
      >
        {facts}
        {cta}
      </div>
    );
  }

  return (
    <Card padding={0} className="flex items-center gap-4 px-5 py-3.5">
      <div className="flex items-center gap-5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
        {facts}
      </div>
      {cta}
    </Card>
  );
}

"use client";

/**
 * CompactStatsBar — 首页紧凑统计行（D3a，产品设计规划 §3.3）。
 *
 * 取代原「今日已完成 N/M」进度环：只展示事实（连续天数/词汇量/已学视频），
 * 不派任务、不施压。「开始复习」仅在有到期词汇时出现（便利入口，不是任务）。
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, BookOpen, Clapperboard, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { usePlan } from "@/hooks/usePlan";

interface VocabStats {
  total: number;
  due_count: number;
}

export function CompactStatsBar() {
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

  const streak = profile?.current_streak ?? 0;
  const dueCount = vocabStats?.due_count ?? 0;

  return (
    <div className="flex items-center gap-4 bg-canvas border border-hairline rounded-xl px-5 py-3.5">
      <div className="flex items-center gap-5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
        <span
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink whitespace-nowrap"
          title="连续学习天数"
        >
          <Flame size={15} className={streak > 0 ? "text-brand-500" : "text-muted-soft"} />
          {streak} 天连续
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink whitespace-nowrap"
          title="词汇本总词数"
        >
          <BookOpen size={15} className="text-muted" />
          {vocabStats ? `${vocabStats.total} 个词` : "–"}
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink whitespace-nowrap"
          title="已学视频数"
        >
          <Clapperboard size={15} className="text-muted" />
          {recordsTotal !== null ? `${recordsTotal} 个视频` : "–"}
        </span>
      </div>
      {/* 便利入口：有到期词才出现（不是任务提醒） */}
      {dueCount > 0 && (
        <Link
          href="/vocabulary/drill"
          className="inline-flex items-center gap-1 shrink-0 px-3.5 py-1.5 rounded-lg bg-brand-500 text-white text-[13px] font-semibold hover:bg-brand-600 transition-colors"
        >
          开始复习
          <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}

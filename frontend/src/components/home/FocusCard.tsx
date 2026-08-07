"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Play, Repeat, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { api } from "@/lib/api";
import type { DailyProgress, LearningPlanItem } from "@/types";

interface FocusCardProps {
  progress: DailyProgress | null;
  planItems: LearningPlanItem[];
  /** When provided and no plan items exist, the CTA becomes "生成今日计划". */
  onGeneratePlan?: () => void;
  generating?: boolean;
}

/** Resolve the href for the first incomplete plan item. */
function firstIncompleteHref(items: LearningPlanItem[]): string | null {
  const item = items.find((i) => !i.completed);
  if (!item) return null;
  if (item.item_type === "watch_video" && item.video_id) return `/watch/${item.video_id}`;
  if (item.item_type === "practice")
    return item.video_id ? `/watch/${item.video_id}` : "/practice/daily";
  if (item.item_type === "shadowing" && item.video_id) return `/watch/${item.video_id}`;
  if (item.item_type === "review_words" || item.item_type === "vocab_drill") return "/vocabulary";
  return "/browse";
}

export function FocusCard({ progress, planItems, onGeneratePlan, generating }: FocusCardProps) {
  const [vocabDue, setVocabDue] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ due_count?: number }>("/api/v1/vocabulary/stats")
      .then((res) => {
        if (!cancelled) setVocabDue(res.due_count ?? 0);
      })
      .catch(() => {
        if (!cancelled) setVocabDue(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const goalProgress = progress?.goal_progress ?? 0;
  const completedCount = planItems.filter((i) => i.completed).length;
  const totalCount = planItems.length;
  const streak = progress?.current_streak ?? 0;
  const weeklyCycles = progress?.weekly_cycles_completed ?? 0;

  // CTA logic: 复习 > 生成计划(无计划时) > 继续学习 > 去浏览
  let ctaLabel = "去浏览";
  let ctaHref = "/browse";
  let ctaMode: "review" | "generate" | "continue" | "browse" = "browse";

  if (vocabDue && vocabDue > 0) {
    ctaLabel = "开始复习";
    ctaHref = "/vocabulary";
    ctaMode = "review";
  } else if (totalCount === 0 && onGeneratePlan) {
    ctaLabel = "生成今日计划";
    ctaMode = "generate";
  } else {
    const href = firstIncompleteHref(planItems);
    if (href) {
      ctaLabel = "继续学习";
      ctaHref = href;
      ctaMode = "continue";
    }
  }

  const ctaClass =
    "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-500 text-on-primary shadow-brand hover:bg-brand-600 hover:shadow-lg hover:shadow-brand-500/20 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0";

  return (
    <div className="relative overflow-hidden rounded-xl border border-hairline bg-canvas p-6">
      {/* Decorative gradient accent */}
      <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-brand-500/[0.04] blur-[60px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 w-32 h-32 rounded-full bg-indigo/[0.03] blur-[50px] pointer-events-none" />

      <div className="relative flex items-center gap-5">
        {/* Progress ring */}
        <ProgressRing
          progress={goalProgress}
          size={76}
          strokeWidth={5.5}
          isMet={progress?.goal_met ?? false}
          label={<span className="text-sm font-bold">{Math.round(goalProgress * 100)}%</span>}
        />

        {/* Text area */}
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-ink tracking-tight">
            {totalCount > 0
              ? `今日已完成 ${completedCount}/${totalCount}`
              : `今日目标 ${Math.round(goalProgress * 100)}%`}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Flame size={13} className="text-brand-500" />
              <span className="font-medium text-body">{streak}</span> 天连续
            </span>
            <span className="flex items-center gap-1.5">
              <Repeat size={13} className="text-indigo" />
              本周循环 <span className="font-medium text-body">{weeklyCycles}/7</span>
            </span>
          </div>
        </div>

        {/* CTA */}
        {ctaMode === "generate" ? (
          <button type="button" onClick={onGeneratePlan} disabled={generating} className={ctaClass}>
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {generating ? "生成中…" : ctaLabel}
          </button>
        ) : (
          <Link href={ctaHref} className={ctaClass}>
            <Play size={15} fill="currentColor" />
            {ctaLabel}
            <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}

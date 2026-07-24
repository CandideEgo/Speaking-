"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Target, Flame, Loader2, BookOpen, Play } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useFeedStore, recommendWithSeenSink } from "@/stores/feedStore";
import { usePlan } from "@/hooks/usePlan";
import { api } from "@/lib/api";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader, SectionLink } from "@/components/ui/SectionHeader";
import { VideoCard } from "@/components/ui/VideoCard";
import { DailyProgressCard } from "@/components/plan/DailyProgressCard";
import { WeeklyCycleCounter } from "@/components/plan/WeeklyCycleCounter";
import { PlanItemCard } from "@/components/plan/PlanItemCard";
import { MasteryBreakdown } from "@/components/plan/MasteryBreakdown";

export default function HomePage() {
  const { user } = useAuthStore();
  const userName = user?.name || "学习者";

  // Learning plan data
  const { plan, progress, profile, completeItem, generateAIPlan, generating } = usePlan();

  // Recommended videos from feed store
  const feed = useFeedStore((s) => s.feed);
  const seenIds = useFeedStore((s) => s.seenIds);
  const markSeen = useFeedStore((s) => s.markSeen);
  const recommended = useMemo(
    () => recommendWithSeenSink(feed, seenIds).slice(0, 4),
    [feed, seenIds]
  );

  const [vocabDue, setVocabDue] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ due_count?: number }>("/api/v1/vocabulary/stats").catch(() => null);
        if (res) setVocabDue(res.due_count ?? 0);
      } catch {
        // silent fallback
      }
    })();
  }, []);

  return (
    <PageTransition>
      <main className="container-page py-7 pb-24">
        {/* ── 问候区 + 主行动 CTA ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-ink">你好，{userName}</h1>
            <p className="text-sm text-muted mt-0.5">
              {new Date().toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <Flame size={16} className="text-coral" />
              {profile?.current_streak ?? 0} 天连续
            </div>
            {/* Primary CTA — the single most important action on the page */}
            <Link
              href={vocabDue && vocabDue > 0 ? "/vocabulary" : "/browse"}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold
                bg-brand-500 text-on-primary shadow-brand
                hover:bg-brand-600 active:scale-[0.98]
                transition-all duration-150"
            >
              <Play size={15} fill="currentColor" />
              {vocabDue && vocabDue > 0 ? "开始复习" : "继续学习"}
            </Link>
          </div>
        </div>

        {/* ── 今日计划仪表盘 ── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-brand-500" />
              <h2 className="text-lg font-semibold text-ink">今日计划</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={generateAIPlan}
                disabled={generating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold
                  bg-brand-50 text-brand-600 border border-brand-100
                  hover:bg-brand-100 hover:border-brand-200
                  disabled:opacity-60 disabled:cursor-not-allowed
                  transition-all duration-150 active:scale-[0.98]"
              >
                {generating ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} />
                )}
                {generating ? "生成中…" : "AI 定制计划"}
              </button>
            </div>
          </div>

          {/* Progress + Cycle + Streak — compact inline stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <DailyProgressCard progress={progress} />
            <WeeklyCycleCounter progress={progress} />
            {/* Streak card — compact */}
            <div className="bg-canvas border border-hairline rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">
                <Flame size={12} className="text-coral" />
                连续学习
              </div>
              <div>
                <div className="text-[28px] font-extrabold tracking-display-lg leading-none text-ink">
                  {profile?.current_streak ?? 0}
                  <span className="text-sm font-semibold text-muted ml-1">天</span>
                </div>
                <div className="text-[11px] text-muted mt-1">
                  最长 {profile?.longest_streak ?? 0} 天
                </div>
              </div>
            </div>
          </div>

          {/* Plan items */}
          {plan && plan.items.length > 0 && (
            <div className="space-y-2">
              {plan.items.map((item) => (
                <PlanItemCard key={item.id} item={item} onComplete={completeItem} />
              ))}
            </div>
          )}
        </div>

        {/* ── 词汇待复习 快捷入口 ── */}
        <div className="mb-8">
          <Link
            href="/vocabulary"
            className="flex items-center justify-between p-6 rounded-lg border bg-brand-50 border-brand-100 hover:border-brand-300 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                <BookOpen size={20} className="text-brand-600" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase font-mono tracking-[0.14em] text-brand-700">
                  词汇待复习
                </div>
                <div className="text-[32px] font-extrabold tracking-display-lg leading-none mt-1 text-brand-600">
                  {vocabDue ?? "—"}
                  <small className="text-[14px] font-semibold ml-1 text-brand-500">词</small>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-medium text-brand-700">
                {vocabDue === null ? "加载中…" : vocabDue > 0 ? "趁热打铁，去复习" : "暂无待复习"}
              </div>
              <ArrowRight
                size={16}
                className="ml-auto mt-1 text-brand-400 group-hover:translate-x-0.5 transition-transform"
              />
            </div>
          </Link>
        </div>

        {/* ── 今日推荐 ── */}
        {recommended.length > 0 && (
          <section className="mb-8">
            <SectionHeader
              title="今日推荐"
              action={
                <SectionLink href="/browse">
                  更多
                  <ArrowRight size={15} />
                </SectionLink>
              }
            />
            <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory">
              {recommended.map((v) => (
                <div
                  key={v.id}
                  className="snap-start shrink-0 w-[240px] sm:w-[260px]"
                  onClick={() => markSeen(v.id)}
                >
                  <VideoCard video={v} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 词汇掌握分布 ── */}
        <section>
          <SectionHeader title="词汇掌握" />
          <MasteryBreakdown profile={profile} />
        </section>
      </main>
    </PageTransition>
  );
}

"use client";

import { useState, useMemo } from "react";
import { ArrowRight, Sparkles, Target, Loader2, Trophy, X, CalendarCheck } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useFeedStore, recommendWithSeenSink } from "@/stores/feedStore";
import { usePlan } from "@/hooks/usePlan";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader, SectionLink } from "@/components/ui/SectionHeader";
import { VideoCard } from "@/components/ui/VideoCard";
import { FocusCard } from "@/components/home/FocusCard";
import { PlanItemCard } from "@/components/plan/PlanItemCard";
import { getMilestoneLabel } from "@/components/profile/MilestoneBadge";

export default function HomePage() {
  const { user } = useAuthStore();
  const userName = user?.name || "学习者";

  // Time-based greeting
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";

  // Learning plan data
  const { plan, progress, profile, completeItem, generateAIPlan, generating } = usePlan();

  // Recommended videos from feed store
  const feed = useFeedStore((s) => s.feed);
  const seenIds = useFeedStore((s) => s.seenIds);
  const markSeen = useFeedStore((s) => s.markSeen);
  const recommended = useMemo(
    () => recommendWithSeenSink(feed, seenIds).slice(0, 6),
    [feed, seenIds]
  );
  const hasSeenVideos = seenIds.length > 0;

  const [milestoneBannerDismissed, setMilestoneBannerDismissed] = useState(false);

  // Find milestones achieved in the last 24h for the banner
  const recentMilestone = useMemo(() => {
    if (!profile?.milestones?.length) return null;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return (
      profile.milestones.find((m) => {
        if (!m.achieved_at) return false;
        return new Date(m.achieved_at).getTime() >= cutoff;
      }) ?? null
    );
  }, [profile?.milestones]);

  return (
    <PageTransition>
      <main className="container-page py-7 pb-24">
        {/* ── 问候区 ── */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-ink tracking-tight">
            {greeting}，{userName}
          </h1>
          <p className="text-sm text-muted mt-1">
            {new Date().toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </p>
        </div>

        {/* ── 成就达成 Banner ── */}
        {recentMilestone && !milestoneBannerDismissed && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-brand-500/20 bg-brand-500/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10">
                <Trophy size={16} className="text-brand-500" />
              </div>
              <p className="text-sm font-medium text-ink">
                恭喜达成「{getMilestoneLabel(recentMilestone.milestone_type)}」！
              </p>
            </div>
            <button
              onClick={() => setMilestoneBannerDismissed(true)}
              className="rounded p-1 text-muted hover:text-ink transition-colors"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* ── Focus Card ── */}
        <div className="mb-8">
          <FocusCard progress={progress} planItems={plan?.items ?? []} />
        </div>

        {/* ── 今日计划 ── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-brand-500" />
              <h2 className="text-lg font-semibold text-ink">今日计划</h2>
            </div>
            <button
              onClick={generateAIPlan}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold
                bg-brand-50 text-brand-600 border border-brand-100
                hover:bg-brand-100 hover:border-brand-200
                disabled:opacity-60 disabled:cursor-not-allowed
                transition-all duration-150 active:scale-[0.98]"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {generating ? "生成中…" : "AI 定制计划"}
            </button>
          </div>

          {/* Plan items */}
          {plan && plan.items.length > 0 ? (
            <div className="space-y-2">
              {plan.items.map((item) => (
                <PlanItemCard key={item.id} item={item} onComplete={completeItem} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-hairline bg-surface-soft/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 mb-3">
                <CalendarCheck size={22} className="text-brand-500" />
              </div>
              <p className="text-sm font-medium text-ink">还没有今日计划</p>
              <p className="text-xs text-muted mt-1 mb-4">点击「AI 定制计划」生成专属学习方案</p>
              <button
                onClick={generateAIPlan}
                disabled={generating}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold
                  bg-brand-500 text-on-primary shadow-brand
                  hover:bg-brand-600 hover:-translate-y-0.5
                  disabled:opacity-60 disabled:cursor-not-allowed
                  transition-all duration-150 active:scale-[0.98]"
              >
                {generating ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} />
                )}
                {generating ? "生成中…" : "生成今日计划"}
              </button>
            </div>
          )}
        </div>

        {/* ── 继续观看 / 今日推荐 ── */}
        {recommended.length > 0 && (
          <section>
            <SectionHeader
              title={hasSeenVideos ? "继续观看" : "今日推荐"}
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
      </main>
    </PageTransition>
  );
}

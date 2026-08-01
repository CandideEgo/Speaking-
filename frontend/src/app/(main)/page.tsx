"use client";

import { useMemo, useState } from "react";
import { Trophy, X, Compass } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { usePlan } from "@/hooks/usePlan";
import { usePlatformFeed } from "@/hooks/usePlatformFeed";
import { PageTransition } from "@/components/common/PageTransition";
import { VideoCard, VideoCardSkeleton } from "@/components/ui/VideoCard";
import { TabPills } from "@/components/ui/TabPills";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { FocusCard } from "@/components/home/FocusCard";
import { getMilestoneLabel } from "@/components/profile/MilestoneBadge";

const DIFFICULTY_LEVELS = [
  { id: "all", label: "全部" },
  { id: "A1", label: "A1" },
  { id: "A2", label: "A2" },
  { id: "B1", label: "B1" },
  { id: "B2", label: "B2" },
  { id: "C1", label: "C1" },
  { id: "C2", label: "C2" },
];

export default function HomePage() {
  const { user } = useAuthStore();
  const userName = user?.name || "学习者";

  // Time-based greeting
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";

  // Learning plan data (FocusCard + milestone banner). 今日计划列表已移除，
  // AI 计划生成入口收到 FocusCard CTA（无计划时显示「生成今日计划」）。
  const { plan, progress, profile, generateAIPlan, generating } = usePlan();

  // Video feed (B方案: 首页视频流 = filter-bar + 网格 + 无限滚动)
  const {
    categories,
    activeCategory,
    setActiveCategory,
    activeLevel,
    setActiveLevel,
    videos,
    loading,
    total,
    error,
    retry,
    loaderRef,
  } = usePlatformFeed({ platform: "home" });

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
          <FocusCard
            progress={progress}
            planItems={plan?.items ?? []}
            onGeneratePlan={generateAIPlan}
            generating={generating}
          />
        </div>

        {/* ── 分类筛选栏（filter-bar，复用 browse 模式） ── */}
        <div className="filter-bar">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            {/* Category pills */}
            <div className="flex gap-1.5 overflow-x-auto items-center scrollbar-none">
              <TabPills
                tabs={categories.map((cat) => ({ key: cat.id, label: cat.label }))}
                activeKey={activeCategory}
                onChange={setActiveCategory}
                variant="ghost"
                activeStyle="dark"
                size="sm"
              />
            </div>
            {/* Separator */}
            <div className="hidden md:block w-px h-5 bg-hairline flex-shrink-0" />
            {/* Difficulty pills */}
            <div className="flex gap-1.5 overflow-x-auto items-center scrollbar-none">
              <TabPills
                tabs={DIFFICULTY_LEVELS.map((lv) => ({ key: lv.id, label: lv.label }))}
                activeKey={activeLevel}
                onChange={setActiveLevel}
                variant="ghost"
                activeStyle="brand"
                size="sm"
              />
            </div>
            {/* Result count */}
            {total > 0 && (
              <span className="ml-auto text-xs text-muted flex-shrink-0 hidden sm:block font-medium">
                {total} 个视频
              </span>
            )}
          </div>
        </div>

        {/* ── 视频网格 ── */}
        {error && <ErrorState title={error} onRetry={retry} className="py-8" />}

        {!error && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {videos.map((video) => (
              <VideoCard key={video.id || video.video_id} video={video} />
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && videos.length === 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <VideoCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && videos.length === 0 && !error && (
          <EmptyState
            icon={Compass}
            title="该分类下暂无视频"
            description="请尝试其他筛选条件"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveCategory("all");
                  setActiveLevel("all");
                }}
              >
                清除筛选
              </Button>
            }
          />
        )}

        {/* Infinite scroll trigger */}
        <div ref={loaderRef} className="flex justify-center mt-10">
          {loading && videos.length > 0 && (
            <div className="w-5 h-5 border-2 border-muted-soft border-t-brand-500 rounded-full animate-spin" />
          )}
        </div>
      </main>
    </PageTransition>
  );
}

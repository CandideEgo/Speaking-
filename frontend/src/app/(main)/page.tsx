"use client";

import { useMemo, useState } from "react";
import { Trophy, X, Compass } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { usePlan } from "@/hooks/usePlan";
import { usePlatformFeed } from "@/hooks/usePlatformFeed";
import { CompactStatsBar } from "@/components/home/CompactStatsBar";
import { HomeFilterBar } from "@/components/home/HomeFilterBar";
import { PageTransition } from "@/components/common/PageTransition";
import { VideoCard, VideoCardSkeleton } from "@/components/ui/VideoCard";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { getMilestoneLabel } from "@/components/profile/MilestoneBadge";

export default function HomePage() {
  const { user } = useAuthStore();
  const userName = user?.name || "学习者";

  // Time-based greeting
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";

  // Learning profile (for milestone banner).
  const { profile } = usePlan();

  // Video feed (B方案: 首页视频流 = filter-bar + 网格 + 无限滚动)
  const {
    categories,
    activeCategory,
    setActiveCategory,
    activeLevel,
    setActiveLevel,
    sort,
    setSort,
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

        {/* D3a 紧凑统计行：只展示事实，不施压（替代旧进度环） */}
        <div className="mb-6">
          <CompactStatsBar />
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

        {/* ── 筛选栏：分类（展开）+ 排序（推荐/热播/最新）+ 难度 ── */}
        <HomeFilterBar
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          sort={sort}
          onSortChange={setSort}
          activeLevel={activeLevel}
          onLevelChange={setActiveLevel}
          total={total}
        />

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
                  setSort("recommended");
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

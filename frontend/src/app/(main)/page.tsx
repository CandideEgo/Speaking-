"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Trophy, X, Compass } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { usePlan } from "@/hooks/usePlan";
import { usePlatformFeed } from "@/hooks/usePlatformFeed";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { scrollKey } from "@/lib/scrollMemory";
import { CompactStatsBar } from "@/components/home/CompactStatsBar";
import { ContinueLearningRail } from "@/components/home/ContinueLearningRail";
import { HomeFilterBar } from "@/components/home/HomeFilterBar";
import { TargetExamSetting } from "@/components/exam/TargetExamSetting";
import { PageTransition } from "@/components/common/PageTransition";
import { VideoCard, VideoCardSkeleton } from "@/components/ui/VideoCard";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { getMilestoneLabel } from "@/components/profile/MilestoneBadge";

/** 把后端下发的 YYYY-MM-DD 渲染成「1月2日 星期五」。
 *
 * 用显式年月日构造本地 Date，而不是 `new Date("YYYY-MM-DD")`——后者按 UTC
 * 午夜解析，在东八会回退成前一天。 */
function formatLocalDateLabel(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export default function HomePage() {
  const { user } = useAuthStore();
  const userName = user?.name || "学习者";

  // Learning profile（也供里程碑横幅使用）。
  const { profile } = usePlan();

  // 问候与日期都按**学习时区**算：小时与本地日由后端 profile 下发（BUG-05），
  // 早先用浏览器 `new Date()` 自己算「今天」，与连续天数所在的学习时区可能差一天。
  // profile 未到位时退回中性问候 + 空占位，不猜一个看起来像真值的数字。
  const hour = profile?.local_hour ?? null;
  const greeting =
    hour === null
      ? "你好"
      : hour < 6
        ? "夜深了"
        : hour < 12
          ? "早上好"
          : hour < 18
            ? "下午好"
            : "晚上好";
  const dateLabel = profile?.local_date ? formatLocalDateLabel(profile.local_date) : "";

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
      <main className="py-7 pb-24">
        {/* ── 问候 + 统计 ──
            DEC-080：首屏先给「看什么」。统计从整宽 band 降为头部附属（md+ 与问候并排，
            移动端折到问候下方），内容与入口一个字不少（CompactStatsBar 的 inline 档）。 */}
        <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-display-sm font-bold text-ink tracking-tight">
              {greeting}，{userName}
            </h1>
            <p className="text-copy text-muted mt-1">{dateLabel || "\u00A0"}</p>
          </div>
          <CompactStatsBar variant="inline" />
        </div>

        {/* ── 目标考试入口（P1-1）：固定入口，改目标后播放页考试词高亮立即刷新 ── */}
        <TargetExamSetting compact className="mb-6" />

        {/* ── 成就达成 Banner ── */}
        {recentMilestone && !milestoneBannerDismissed && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-brand-500/20 bg-brand-500/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10">
                <Trophy size={16} className="text-brand-500" />
              </div>
              <p className="text-copy font-medium text-ink">
                恭喜达成「{getMilestoneLabel(recentMilestone.milestone_type)}」！
              </p>
            </div>
            <button
              onClick={() => setMilestoneBannerDismissed(true)}
              className="rounded-md p-1 text-muted hover:text-ink transition-colors"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* ── 继续学习（DEC-080）：登录且存在未完成记录时才渲染 ── */}
        <ContinueLearningRail />

        {/* ── 推荐区 ──
            说明是 section 级：后端没有 per-card reason 字段，卡片级「推荐理由」会与
            难度 / 时长 / 主题徽标重复（DEC-080 的 Trade-offs）。 */}
        <div className="mb-3">
          <h2 className="text-title font-bold text-ink">为你推荐</h2>
          <p className="text-copy text-muted mt-1">根据你的学习情况与难度偏好挑选</p>
        </div>

        {/* ── 筛选栏 + 视频网格（筛选由 URL 派生 → useSearchParams 需要 Suspense 边界） ── */}
        <Suspense
          fallback={
            <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]">
              {Array.from({ length: 8 }).map((_, i) => (
                <VideoCardSkeleton key={i} />
              ))}
            </div>
          }
        >
          <HomeFeed />
        </Suspense>
      </main>
    </PageTransition>
  );
}

/** 首页视频流：筛选栏 + 网格 + 无限滚动。筛选以 URL 为单一真相。 */
function HomeFeed() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    categories,
    activeCategory,
    setActiveCategory,
    activeLevel,
    setActiveLevel,
    effectiveSort,
    setSort,
    videos,
    loading,
    total,
    error,
    retry,
    loaderRef,
  } = usePlatformFeed({ platform: "home" });

  useScrollRestore(scrollKey(pathname, searchParams.toString()), videos.length > 0);

  return (
    <>
      {/* ── 筛选栏：分类（展开）+ 排序（推荐/热播/最新）+ 难度 ── */}
      <HomeFilterBar
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        effectiveSort={effectiveSort}
        onSortChange={setSort}
        activeLevel={activeLevel}
        onLevelChange={setActiveLevel}
        total={total}
      />

      {/* ── 视频网格 ── */}
      {error && <ErrorState title={error} onRetry={retry} className="py-8" />}

      {!error && (
        <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]">
          {videos.map((video) => (
            <VideoCard
              key={video.id || video.video_id}
              video={video}
              // 透传原始 URL 值（含 null），返回 URL 才能与离开时逐字节一致，
              // 滚动记忆的 key 也才对得上。
              entry={{
                from: "home",
                extra: {
                  category: searchParams.get("category"),
                  level: searchParams.get("level"),
                  sort: searchParams.get("sort"),
                },
              }}
            />
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && videos.length === 0 && (
        <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]">
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
    </>
  );
}

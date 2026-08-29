"use client";

import { useMemo, useState } from "react";
import { Trophy, X, Compass, Check } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { usePlan } from "@/hooks/usePlan";
import { usePlatformFeed } from "@/hooks/usePlatformFeed";
import { useUnlockedIds } from "@/hooks/useUnlockedIds";
import { useBoostUnlocked } from "@/hooks/useBoostUnlocked";
import { UnlockQuotaHint } from "@/components/paywall/UnlockQuotaHint";
import { CompactStatsBar } from "@/components/home/CompactStatsBar";
import { PageTransition } from "@/components/common/PageTransition";
import { VideoCard, VideoCardSkeleton } from "@/components/ui/VideoCard";
import { TabPills } from "@/components/ui/TabPills";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
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

  // Learning profile (for milestone banner).
  const { profile } = usePlan();

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

  // D0 解锁制：Free 视角的卡片角标（已解锁 ✓ / 锁标 / 耗尽灰度）
  const unlockedInfo = useUnlockedIds();

  // §10 #7：用户可选「已解锁优先」开关。开启后把 unlocked 视频排到
  // 视频流前面，未解锁的跟在后面（保持各自内部相对顺序）。
  const { enabled: boostUnlocked, setEnabled: setBoostUnlocked, ready: boostReady } =
    useBoostUnlocked();

  const orderedVideos = useMemo(() => {
    if (!boostUnlocked || !unlockedInfo) return videos;
    const unlocked: typeof videos = [];
    const rest: typeof videos = [];
    for (const v of videos) {
      if (unlockedInfo.lockStateFor(v) === "unlocked") unlocked.push(v);
      else rest.push(v);
    }
    return [...unlocked, ...rest];
  }, [videos, unlockedInfo, boostUnlocked]);

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
            {/* D11 Free 额度入口 + 结果计数 */}
            <div className="ml-auto flex items-center gap-3 flex-shrink-0">
              {/* §10 #7：已解锁优先开关（仅 Free 视角且有解锁历史时显示）。
                  Pro 用户走 D11 额度提示即可，无需此开关。 */}
              {boostReady && unlockedInfo && (
                <label
                  className="hidden sm:inline-flex items-center gap-1.5 cursor-pointer
                    text-[12px] font-medium select-none
                    text-muted hover:text-ink transition-colors"
                  title="开启后已解锁视频排到前面"
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={boostUnlocked}
                    onChange={(e) => setBoostUnlocked(e.target.checked)}
                    aria-label="把已解锁视频排到前面"
                  />
                  <span
                    aria-hidden="true"
                    className="relative inline-flex h-4 w-7 items-center rounded-full
                      transition-colors
                      bg-hairline peer-checked:bg-brand-500
                      peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500
                      peer-focus-visible:ring-offset-1"
                  >
                    <span
                      className="inline-block h-3 w-3 transform rounded-full bg-white shadow
                        transition-transform
                        translate-x-0.5 peer-checked:translate-x-3.5"
                    />
                  </span>
                  <span
                    className={
                      boostUnlocked
                        ? "inline-flex items-center gap-0.5 text-brand-600"
                        : ""
                    }
                  >
                    {boostUnlocked && <Check size={11} aria-hidden="true" />}
                    已解锁优先
                  </span>
                </label>
              )}
              <UnlockQuotaHint info={unlockedInfo} />
              {total > 0 && (
                <span className="text-xs text-muted hidden sm:block font-medium">
                  {total} 个视频
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── 视频网格 ── */}
        {error && <ErrorState title={error} onRetry={retry} className="py-8" />}

        {!error && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {orderedVideos.map((video) => (
              <VideoCard
                key={video.id || video.video_id}
                video={video}
                lockState={unlockedInfo?.lockStateFor(video)}
              />
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

"use client";

import { Compass } from "lucide-react";
import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { Select } from "@/components/ui/Select";
import { TabPills } from "@/components/ui/TabPills";
import { VideoCardSkeleton } from "@/components/ui/VideoCard";
import { HomeFeedCard } from "@/components/home/HomeFeedCard";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { FEED_SORT_OPTIONS, usePlatformFeed, type FeedSort } from "@/hooks/usePlatformFeed";
import { useScrollRestore } from "@/hooks/useScrollRestore";
import { SCROLL_CONTAINER_ID, saveScroll, scrollKey } from "@/lib/scrollMemory";
import { CEFR_LEVELS, cefrWithExamHint } from "@/lib/cefrLevels";

/**
 * 首页下滑流：原 `/browse` 的筛选与无限滚动并入首页。
 *
 * 工具条三件事：分类 chips、难度、排序。默认视图是「全部 + 推荐」的个性化
 * 混合流；选了分类/难度后落到最新（`推荐` 选项在筛选时隐藏，见 usePlatformFeed）。
 * 筛选写 URL，滚动位置按「路径 + query」记忆，从播放页返回时原样恢复。
 */

const DIFFICULTY_OPTIONS = [
  { id: "all", label: "全部档位" },
  ...CEFR_LEVELS.map((level) => ({ id: level, label: cefrWithExamHint(level) })),
];

export function HomeFeed({ layoutReady = true }: { layoutReady?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    categories,
    activeCategory,
    setActiveCategory,
    activeLevel,
    setActiveLevel,
    setSort,
    effectiveSort,
    clearFilters,
    isFiltered,
    videos,
    loading,
    hasMore,
    total,
    error,
    retry,
    loadMore,
    loaderRef,
  } = usePlatformFeed();

  // 精选与续看也会改变列表上方的高度，等它们就绪再恢复列表位置。
  useScrollRestore(scrollKey(pathname, searchParams.toString()), layoutReady && videos.length > 0, {
    restoreOnKeyChange: false,
  });

  const sortOptions = isFiltered
    ? FEED_SORT_OPTIONS.filter((option) => option.id !== "recommended")
    : FEED_SORT_OPTIONS;
  // 推荐流分页的接口没有「稳定游标」：继续翻页时偶尔会重复返回上一页的视频。
  // 同一视频在列表里出现两次会让 React key 冲突、也让计数虚高；渲染前按 id
  // 去重（保留第一次出现的位置），不改变筛选/排序/加载能力。
  const uniqueVideos = useMemo(() => {
    const seen = new Set<string>();
    return videos.filter((video) => {
      const key = String(video.id || video.video_id || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [videos]);
  const categoryLabel =
    categories.find((category) => category.id === activeCategory)?.label ?? activeCategory;
  const levelLabel = activeLevel === "all" ? "全部档位" : cefrWithExamHint(activeLevel);
  const activeFilters = [
    activeCategory !== "all" ? `分类「${categoryLabel}」` : null,
    activeLevel !== "all" ? `难度「${levelLabel}」` : null,
  ].filter(Boolean);
  const remaining = Math.max(0, total - uniqueVideos.length);

  return (
    <>
      {/* 筛选工具条：一行放完。分类横向滚动，难度 / 时长 / 排序固定在右侧；
          窄屏（<lg）才允许换行，避免 1440 宽度下「排序」单独掉到第二行。 */}
      <div className="flex flex-col gap-3 border-b border-hairline pb-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none">
          <TabPills
            tabs={categories.map((category) => ({ key: category.id, label: category.label }))}
            activeKey={activeCategory}
            onChange={setActiveCategory}
            variant="chips"
            className="flex-nowrap"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:flex-nowrap">
          <label htmlFor="feed-level" className="flex items-center gap-1.5 text-caption text-muted">
            难度
            <Select
              id="feed-level"
              value={activeLevel}
              onChange={(event) => setActiveLevel(event.target.value)}
              className="h-8 w-[5.7rem] rounded-pill border-hairline-strong py-0 pl-2.5 pr-7 text-caption"
            >
              {DIFFICULTY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label htmlFor="feed-sort" className="flex items-center gap-1.5 text-caption text-muted">
            排序
            <Select
              id="feed-sort"
              value={effectiveSort}
              onChange={(event) => setSort(event.target.value as FeedSort)}
              className="h-8 w-[4.8rem] rounded-pill border-hairline-strong py-0 pl-2.5 pr-7 text-caption"
            >
              {sortOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          {total > 0 && (
            <span className="text-caption text-muted tabular-nums" aria-live="polite">
              {total} 个视频
            </span>
          )}
        </div>
      </div>

      {/* 首屏失败才整块报错；翻页失败时列表还在，只在底部给重试，别把已看的内容抹掉 */}
      {error && uniqueVideos.length === 0 && (
        <ErrorState title={error} onRetry={retry} className="py-8" />
      )}

      {uniqueVideos.length > 0 && (
        <div
          data-testid="home-feed-grid"
          className="mt-5 grid min-w-0 grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2 xl:grid-cols-3 min-[1680px]:!grid-cols-4"
          onClickCapture={() => {
            const container = document.getElementById(SCROLL_CONTAINER_ID);
            if (container)
              saveScroll(scrollKey(pathname, searchParams.toString()), container.scrollTop);
          }}
        >
          {uniqueVideos.map((video) => (
            <HomeFeedCard
              key={video.id || video.video_id}
              video={video}
              showTopic={activeCategory === "all"}
              // 原始 URL 值（含 null）原样带走，返回 URL 与离开时一致。
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

      {loading && uniqueVideos.length === 0 && (
        <div className="mt-5 grid min-w-0 grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2 xl:grid-cols-3 min-[2100px]:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && uniqueVideos.length === 0 && !error && (
        <EmptyState
          icon={Compass}
          title={isFiltered ? "没有同时满足这些条件的视频" : "暂时还没有视频"}
          description={
            isFiltered
              ? `当前筛选：${activeFilters.join(" · ")}。换一个组合，或清除筛选。`
              : "站内还没有可浏览的视频，先去频道看看有哪些内容。"
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              {isFiltered && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  清除筛选
                </Button>
              )}
              <LinkButton variant="text" size="sm" href="/channels">
                按频道找
              </LinkButton>
            </div>
          }
        />
      )}

      {/* 无限滚动哨兵：IntersectionObserver 命中就翻页 */}
      <div ref={loaderRef} className="mt-10 flex flex-col items-center gap-2">
        {loading && uniqueVideos.length > 0 && (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-hairline-strong border-t-brand-500" />
        )}
        {!loading && !error && uniqueVideos.length > 0 && hasMore && remaining > 0 && (
          <p className="text-meta text-muted">还有 {remaining} 段 · 继续向下滚动加载</p>
        )}
        {error && uniqueVideos.length > 0 && (
          <Button variant="outline" size="sm" onClick={loadMore}>
            加载更多失败，重试
          </Button>
        )}
      </div>
    </>
  );
}

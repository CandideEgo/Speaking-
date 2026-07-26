"use client";

import { Button } from "@/components/ui/Button";
import { TabPills } from "@/components/ui/TabPills";
import { PageHeader } from "@/components/ui/PageHeader";
import { VideoCard, VideoCardSkeleton } from "@/components/ui/VideoCard";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { usePlatformFeed } from "@/hooks/usePlatformFeed";
import { PageTransition } from "@/components/common/PageTransition";
import { Compass } from "lucide-react";

const DIFFICULTY_LEVELS = [
  { id: "all", label: "全部" },
  { id: "A1", label: "A1" },
  { id: "A2", label: "A2" },
  { id: "B1", label: "B1" },
  { id: "B2", label: "B2" },
  { id: "C1", label: "C1" },
  { id: "C2", label: "C2" },
];

export default function BrowsePage() {
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
  } = usePlatformFeed({ platform: "browse" });

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-10">
        {/* Page header */}
        <PageHeader crumb="发现" title="浏览视频" />

        {/* Sticky filter bar */}
        <div className="filter-bar">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            {/* Category pills */}
            <div className="flex gap-1.5 overflow-x-auto items-center scrollbar-none">
              <TabPills
                tabs={categories.map((cat) => ({
                  key: cat.id,
                  label: cat.label,
                }))}
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
                tabs={DIFFICULTY_LEVELS.map((lv) => ({
                  key: lv.id,
                  label: lv.label,
                }))}
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

        {/* Error state */}
        {error && <ErrorState title={error} onRetry={retry} className="py-8" />}

        {/* Video grid */}
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

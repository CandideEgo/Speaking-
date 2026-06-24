"use client";

import { Loader2, Play } from "lucide-react";
import { usePlatformFeed } from "@/hooks/usePlatformFeed";
import { SkeletonCardGrid } from "@/components/common/SkeletonCard";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { CategoryTabs } from "@/components/channel/CategoryTabs";
import { VideoCard } from "@/components/channel/VideoCard";

export default function DouyinPage() {
  const {
    categories,
    activeCategory,
    setActiveCategory,
    videos,
    loading,
    hasMore,
    error,
    retry,
    loaderRef,
    addingId,
    startLearning,
  } = usePlatformFeed({ platform: "douyin" });

  return (
    <PageTransition>
      <main className="min-h-screen bg-white">
        {/* Header - Light theme */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100">
          <div className="px-4 py-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#18191c]" fill="currentColor">
                  <path d="M12.53.02C13.62 6.15 17.87 10.4 24 11.5c-6.13 1.1-10.38 5.35-11.5 11.5C11.38 16.35 7.13 12.1.99 11c6.14-1.1 10.39-5.35 11.5-11.5z" />
                </svg>
                <span className="text-lg font-bold text-[#18191c]">抖音</span>
              </div>
            </div>
            <CategoryTabs
              categories={categories}
              activeId={activeCategory}
              onSelect={setActiveCategory}
              variant="solid"
              bgClass="bg-white"
            />
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-500 mb-2">{error}</p>
            <button onClick={retry} className="text-sm text-[#00aeec] hover:underline">
              重试
            </button>
          </div>
        )}

        {/* Video Grid */}
        <div className="px-4 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {videos.map((item) => (
              <VideoCard
                key={item.video_id}
                variant="douyin"
                video={item}
                onClick={() => startLearning(item)}
                isLoading={addingId === item.video_id}
              />
            ))}
          </div>

          {loading && videos.length === 0 && (
            <SkeletonCardGrid
              count={12}
              variant="douyin"
              columns="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            />
          )}

          {!loading && videos.length === 0 && !error && (
            <EmptyState
              icon={Play}
              title="暂无内容"
              description="该分类下暂无视频，请尝试其他分类"
            />
          )}

          <div ref={loaderRef} className="flex justify-center py-8">
            {loading && videos.length > 0 && (
              <Loader2 size={24} className="animate-spin text-gray-400" />
            )}
            {!hasMore && videos.length > 0 && (
              <p className="text-sm text-gray-500">已加载全部内容</p>
            )}
          </div>
        </div>
      </main>
    </PageTransition>
  );
}

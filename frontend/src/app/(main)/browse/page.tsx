'use client';

import { Loader2, Youtube } from 'lucide-react';
import { usePlatformFeed } from '@/hooks/usePlatformFeed';
import { SkeletonCardGrid } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { PageTransition } from '@/components/PageTransition';
import { CategoryTabs } from '@/components/channel/CategoryTabs';
import { ShortsRow } from '@/components/channel/ShortsRow';
import { VideoCard } from '@/components/channel/VideoCard';

export default function BrowsePage() {
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
  } = usePlatformFeed({ platform: 'browse' });

  // Shorts data from first few videos
  const shortsItems = videos.slice(0, 8).map(v => ({
    id: v.video_id,
    thumbnail_url: v.thumbnail_url,
    title: v.title,
    view_count: v.view_count,
  }));

  return (
    <PageTransition>
      <main className="min-h-screen bg-white">
        {/* Sticky category tabs - YouTube style */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100">
          <div className="px-4 py-2">
            <CategoryTabs
              categories={categories}
              activeId={activeCategory}
              onSelect={setActiveCategory}
              variant="pill"
              bgClass="bg-white"
            />
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-500 mb-2">{error}</p>
            <button
              onClick={retry}
              className="text-sm text-[#00aeec] hover:underline"
            >
              重试
            </button>
          </div>
        )}

        {/* Shorts Section — above main grid like YouTube */}
        {shortsItems.length > 0 && (
          <div className="px-4 pt-4">
            <ShortsRow
              items={shortsItems}
              onClick={(short) => {
                const video = videos.find(v => v.video_id === short.id);
                if (video) startLearning(video);
              }}
            />
          </div>
        )}

        {/* Video Grid */}
        <div className="px-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {videos.map((item) => (
              <VideoCard
                key={item.video_id}
                variant="youtube"
                video={item}
                onClick={() => startLearning(item)}
                isLoading={addingId === item.video_id}
              />
            ))}
          </div>

          {loading && videos.length === 0 && <SkeletonCardGrid count={8} className="mt-0" />}

          {!loading && videos.length === 0 && !error && (
            <EmptyState icon={Youtube} title="暂无内容" description="该分类下暂无视频，请尝试其他分类" />
          )}

          <div ref={loaderRef} className="flex justify-center py-8">
            {loading && videos.length > 0 && <Loader2 size={24} className="animate-spin text-gray-400" />}
            {!hasMore && videos.length > 0 && <p className="text-sm text-gray-500">已加载全部内容</p>}
          </div>
        </div>
      </main>
    </PageTransition>
  );
}

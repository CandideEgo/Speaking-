'use client';

import { Loader2, Play, Flame, Trophy, TrendingUp } from 'lucide-react';
import { usePlatformFeed } from '@/hooks/usePlatformFeed';
import { formatViews } from '@/lib/format';
import { SkeletonCardGrid } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { PageTransition } from '@/components/PageTransition';
import { CategoryTabs } from '@/components/channel/CategoryTabs';
import { BannerCarousel } from '@/components/channel/BannerCarousel';
import { VideoCard } from '@/components/channel/VideoCard';

// Mock banner data
const BANNER_ITEMS = [
  { id: '1', image_url: '', title: '英语学习精选推荐' },
  { id: '2', image_url: '', title: 'TED 演讲每日更新' },
  { id: '3', image_url: '', title: '英美文化深度解析' },
];

// Mock hot tags
const HOT_TAGS = ['英语口语', '雅思备考', '美剧学习', '商务英语', '旅行英语', '英语听力', '英语写作', '英语语法'];

// Mock ranking
const RANKING_ITEMS = [
  { rank: 1, title: '10分钟学会商务英语', views: 125000 },
  { rank: 2, title: '雅思口语高分技巧', views: 98000 },
  { rank: 3, title: '英美文化差异解析', views: 87000 },
  { rank: 4, title: '旅行英语必备短语', views: 76000 },
  { rank: 5, title: 'TED演讲精选合集', views: 65000 },
];

export default function BilibiliPage() {
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
  } = usePlatformFeed({ platform: 'bilibili' });

  return (
    <PageTransition>
      <main className="min-h-screen bg-white">
        <div className="flex">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Banner Carousel */}
            <div className="px-4 pt-4">
              <BannerCarousel items={BANNER_ITEMS} />
            </div>

            {/* Category Tabs */}
            <div className="px-4 border-b border-[#e3e5e7]">
              <CategoryTabs
                categories={categories}
                activeId={activeCategory}
                onSelect={setActiveCategory}
                variant="underline"
                bgClass="bg-white"
              />
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

            {/* Video Grid */}
            <div className="px-4 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {videos.map((item) => (
                  <VideoCard
                    key={item.video_id}
                    variant="bilibili"
                    video={item}
                    onClick={() => startLearning(item)}
                    isLoading={addingId === item.video_id}
                  />
                ))}
              </div>

              {loading && videos.length === 0 && <SkeletonCardGrid count={8} className="mt-0" />}

              {!loading && videos.length === 0 && !error && (
                <EmptyState icon={Play} title="暂无内容" description="该分类下暂无视频，请尝试其他分类" />
              )}

              <div ref={loaderRef} className="flex justify-center py-8">
                {loading && videos.length > 0 && <Loader2 size={24} className="animate-spin text-[#00aeec]" />}
                {!hasMore && videos.length > 0 && <p className="text-sm text-[#9499a0]">已加载全部内容</p>}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Recommendations */}
          <div className="hidden xl:block w-[280px] flex-shrink-0 px-4 py-4 border-l border-[#e3e5e7]">
            {/* Hot Tags */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Flame size={16} className="text-[#fb7299]" />
                <h3 className="text-sm font-bold text-[#18191c]">热门标签</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {HOT_TAGS.map((tag) => (
                  <button
                    key={tag}
                    className="px-3 py-1.5 text-xs rounded-full bg-[#f1f2f3] text-[#61666d] hover:bg-[#00aeec]/10 hover:text-[#00aeec] transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Ranking */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Trophy size={16} className="text-[#ff7f24]" />
                <h3 className="text-sm font-bold text-[#18191c]">排行榜</h3>
              </div>
              <div className="flex flex-col gap-2">
                {RANKING_ITEMS.map((item) => (
                  <div
                    key={item.rank}
                    className="flex items-start gap-2 p-2 rounded-lg hover:bg-[#f1f2f3] cursor-pointer transition-colors"
                  >
                    <span className={`
                      flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-bold
                      ${item.rank <= 3 ? 'bg-[#ff7f24] text-white' : 'bg-[#f1f2f3] text-[#9499a0]'}
                    `}>
                      {item.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#18191c] line-clamp-2 leading-snug">{item.title}</p>
                      <p className="text-[10px] text-[#9499a0] mt-0.5">{formatViews(item.views)} views</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trending */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-[#00aeec]" />
                <h3 className="text-sm font-bold text-[#18191c]">正在热播</h3>
              </div>
              <div className="flex flex-col gap-2">
                {RANKING_ITEMS.slice(0, 3).map((item) => (
                  <div
                    key={item.rank}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#f1f2f3] cursor-pointer transition-colors"
                  >
                    <div className="w-16 h-10 rounded bg-gradient-to-br from-[#00aeec]/20 to-[#fb7299]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-[#18191c]">{item.rank}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#18191c] line-clamp-2 leading-snug">{item.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </PageTransition>
  );
}

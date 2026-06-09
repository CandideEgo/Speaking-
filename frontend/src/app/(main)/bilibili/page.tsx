'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDuration, formatViews } from '@/lib/format';
import { Loader2, Play, Eye, MessageSquare, Flame, Trophy, TrendingUp } from 'lucide-react';
import { SkeletonCardGrid } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { PageTransition } from '@/components/PageTransition';
import { CategoryTabs } from '@/components/channel/CategoryTabs';
import { BannerCarousel } from '@/components/channel/BannerCarousel';

interface Category {
  id: string;
  label: string;
}

interface VideoItem {
  video_id: string;
  url: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  duration: number | null;
  view_count: number | null;
}

const CATEGORY_ZH: Record<string, string> = {
  all: '首页',
  spoken: '口语练习',
  interview: '面试英语',
  travel: '旅行英语',
  business: '商务英语',
  culture: '文化差异',
  daily: '日常对话',
};

function categoryLabel(cat: Category): string {
  return CATEGORY_ZH[cat.id] || cat.label;
}

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
  const router = useRouter();
  const loaderRef = useRef<HTMLDivElement>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    api<{ categories: Category[] }>('/api/v1/bilibili/categories')
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, []);

  const fetchFeed = useCallback(async (cat: string, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ category: cat, page: String(pg) });
      const data = await api<{ items: VideoItem[]; has_more: boolean }>(`/api/v1/bilibili/feed?${params.toString()}`);
      if (pg === 1) setVideos(data.items);
      else setVideos((prev) => [...prev, ...data.items]);
      setHasMore(data.has_more);
    } catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { setPage(1); setVideos([]); setHasMore(true); fetchFeed(activeCategory, 1); }, [activeCategory, fetchFeed]);

  useEffect(() => {
    const el = loaderRef.current; if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        const nextPage = page + 1; setPage(nextPage); fetchFeed(activeCategory, nextPage);
      }
    }, { threshold: 0.1 });
    observer.observe(el); return () => observer.disconnect();
  }, [hasMore, loading, page, activeCategory, fetchFeed]);

  async function startLearning(item: VideoItem) {
    setAddingId(item.video_id);
    try {
      const video = await api<{ id: string }>('/api/v1/videos', { method: 'POST', body: JSON.stringify({ source_url: item.url }) });
      router.push(`/watch/${video.id}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : '添加失败'); setAddingId(null); }
  }

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
                categories={categories.map(c => ({ ...c, label: categoryLabel(c) }))}
                activeId={activeCategory}
                onSelect={setActiveCategory}
                variant="underline"
                bgClass="bg-white"
              />
            </div>

            {/* Video Grid */}
            <div className="px-4 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {videos.map((item) => (
                  <div
                    key={item.video_id}
                    onClick={() => startLearning(item)}
                    className="group cursor-pointer flex flex-col gap-2"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-xl bg-gray-100">
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt={item.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-[#00aeec]/20 to-[#fb7299]/20 flex items-center justify-center">
                          <span className="text-2xl font-bold text-[#18191c]">{item.title.charAt(0)}</span>
                        </div>
                      )}
                      {item.duration && item.duration > 0 && (
                        <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                        <Play size={36} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-white text-[11px]">
                        <Eye size={12} />
                        <span>{formatViews(item.view_count)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#18191c] line-clamp-2 leading-snug">{item.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#9499a0]">{item.channel_title}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-[#9499a0]">
                          <span className="flex items-center gap-1">
                            <Eye size={12} />
                            {formatViews(item.view_count)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare size={12} />
                            {(item.view_count ? Math.floor(item.view_count / 100) : 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {page === 1 && loading && videos.length === 0 && <SkeletonCardGrid count={8} className="mt-0" />}

              {!loading && videos.length === 0 && (
                <EmptyState icon={Play} title="暂无内容" description="该分类下暂无视频，请尝试其他分类" />
              )}

              <div ref={loaderRef} className="flex justify-center py-8">
                {page > 1 && loading && <Loader2 size={24} className="animate-spin text-[#00aeec]" />}
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

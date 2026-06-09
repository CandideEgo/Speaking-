'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Loader2, Play } from 'lucide-react';
import { SkeletonCardGrid } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { PageTransition } from '@/components/PageTransition';
import { CategoryTabs } from '@/components/channel/CategoryTabs';

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
  all: '全部',
  spoken: '口语表达',
  slang: '地道俚语',
  pronunciation: '发音技巧',
  vocabulary: '词汇积累',
  culture: '英美文化',
  daily: '日常英语',
};

function categoryLabel(cat: Category): string {
  return CATEGORY_ZH[cat.id] || cat.label;
}

function formatDuration(sec: number | null): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViews(n: number | null): string {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function DouyinPage() {
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
    api<{ categories: Category[] }>('/api/v1/douyin/categories')
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, []);

  const fetchFeed = useCallback(async (cat: string, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ category: cat, page: String(pg) });
      const data = await api<{ items: VideoItem[]; has_more: boolean }>(`/api/v1/douyin/feed?${params.toString()}`);
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
      <main className="min-h-screen bg-[#0f0f0f] text-white">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-[#0f0f0f]/95 backdrop-blur-sm border-b border-[#2a2a2a]">
          <div className="px-4 py-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                  <path d="M12.53.02C13.62 6.15 17.87 10.4 24 11.5c-6.13 1.1-10.38 5.35-11.5 11.5C11.38 16.35 7.13 12.1.99 11c6.14-1.1 10.39-5.35 11.5-11.5z"/>
                </svg>
                <span className="text-lg font-bold">抖音</span>
              </div>
            </div>
            <CategoryTabs
              categories={categories.map(c => ({ ...c, label: categoryLabel(c) }))}
              activeId={activeCategory}
              onSelect={setActiveCategory}
              variant="solid"
              bgClass="bg-[#0f0f0f]"
            />
          </div>
        </div>

        {/* Video Grid */}
        <div className="px-4 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {videos.map((item) => (
              <div
                key={item.video_id}
                onClick={() => startLearning(item)}
                className="group cursor-pointer flex flex-col gap-2"
              >
                <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-[#1a1a1a]">
                  {item.thumbnail_url ? (
                    <img
                      src={item.thumbnail_url}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                      <span className="text-3xl font-bold text-gray-400">{item.title.charAt(0)}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                    <Play size={40} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {item.duration && item.duration > 0 && (
                    <span className="absolute bottom-2 right-2 rounded-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                      {formatDuration(item.duration)}
                    </span>
                  )}
                </div>
                <div className="px-1">
                  <p className="text-sm font-medium text-white line-clamp-2 leading-snug">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <span className="line-clamp-1">{item.channel_title}</span>
                    {item.view_count && <><span>·</span><span className="shrink-0">{formatViews(item.view_count)}</span></>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {page === 1 && loading && videos.length === 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-[#1a1a1a]">
                    <div className="absolute inset-0 animate-pulse bg-[#1a1a1a]" />
                  </div>
                  <div className="h-4 bg-[#1a1a1a] rounded animate-pulse w-[80%]" />
                  <div className="h-3 bg-[#1a1a1a] rounded animate-pulse w-[60%]" />
                </div>
              ))}
            </div>
          )}

          {!loading && videos.length === 0 && (
            <EmptyState icon={Play} title="暂无内容" description="该分类下暂无视频，请尝试其他分类" />
          )}

          <div ref={loaderRef} className="flex justify-center py-8">
            {page > 1 && loading && <Loader2 size={24} className="animate-spin text-gray-400" />}
            {!hasMore && videos.length > 0 && <p className="text-sm text-gray-500">已加载全部内容</p>}
          </div>
        </div>
      </main>
    </PageTransition>
  );
}

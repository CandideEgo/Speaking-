'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Loader2, Play, Plus, Users } from 'lucide-react';

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
  ted: 'TED 演讲',
  interview: '名人访谈',
  news: '新闻',
  vlog: '生活 Vlog',
  educational: '教育学习',
  movie: '电影片段',
  tech: '科技',
};

function categoryLabel(cat: Category): string {
  return CATEGORY_ZH[cat.id] || cat.label;
}

export default function CommunityPage() {
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
    api<{ categories: Category[] }>('/api/v1/community/categories')
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, []);

  const fetchFeed = useCallback(async (cat: string, pg: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ category: cat, page: String(pg) });
      const data = await api<{ items: VideoItem[]; has_more: boolean }>(`/api/v1/community/feed?${params.toString()}`);
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

  function formatDuration(sec: number | null): string { if (!sec) return ''; const m = Math.floor(sec / 60); const s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }
  function formatViews(n: number | null): string { if (!n) return ''; if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M` ; if (n >= 1_000) return `${(n / 1000)}K`; return String(n); }

  return (
    <main>
      <section className="border-b border-hairline bg-canvas">
        <div className="container-page py-8 sm:py-12">
          <div className="flex items-center gap-2 text-coral mb-3">
            <Users size={20} />
            <span className="text-xs font-semibold tracking-caption-wide uppercase">社区精选</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-normal text-ink tracking-display-xl leading-tight">社区热门</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-lg">社区推荐的优质 YouTube 英语视频</p>
        </div>
      </section>

      {/* Category tabs */}
      <div className="bg-canvas border-b border-hairline">
        <div className="container-page">
          <div className="flex items-center gap-2 overflow-x-auto py-3 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                  activeCategory === cat.id
                    ? 'bg-cream-card text-ink'
                    : 'text-muted-foreground hover:text-ink hover:bg-cream-soft'
                )}
              >
                {categoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Video grid */}
      <section className="container-page pb-16 pt-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((item) => (
            <div
              key={item.video_id}
              className="group cursor-pointer rounded-lg border border-hairline bg-canvas overflow-hidden hover:border-coral/30 hover:shadow-sm transition-all"
              onClick={() => startLearning(item)}
            >
              <div className="relative aspect-video bg-cream-soft">
                {item.thumbnail_url ? (
                  <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center"><Play size={32} className="text-muted-foreground" /></div>
                )}
                {item.duration && <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium text-white">{formatDuration(item.duration)}</span>}
                <div className="absolute inset-0 flex items-center justify-center bg-ink/0 group-hover:bg-ink/20 transition-colors">
                  <Plus size={36} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="p-3.5">
                <p className="text-sm font-medium text-ink line-clamp-2 leading-snug">{item.title}</p>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="line-clamp-1">{item.channel_title}</span>
                  {item.view_count && <><span>·</span><span className="shrink-0">{formatViews(item.view_count)} views</span></>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div ref={loaderRef} className="flex justify-center py-8">
          {loading && <Loader2 size={24} className="animate-spin text-coral" />}
          {!hasMore && videos.length > 0 && <p className="text-sm text-muted-foreground">已加载全部内容</p>}
          {!loading && !hasMore && videos.length === 0 && <p className="text-sm text-muted-foreground">暂无内容，请尝试其他分类</p>}
        </div>
      </section>
    </main>
  );
}

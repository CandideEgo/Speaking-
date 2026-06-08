'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDuration, formatViews } from '@/lib/format';
import { Loader2, Play, Plus, Users } from 'lucide-react';
import { SkeletonCardGrid } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { PageTransition } from '@/components/PageTransition';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { StaggerContainer } from '@/components/StaggerContainer';

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

  return (
    <PageTransition>
    <main>
      <section className="border-b border-hairline-cream bg-parchment">
        <div className="container-page py-8 sm:py-12">
          <div className="flex items-center gap-2 text-terracotta mb-3">
            <Users size={20} />
            <span className="text-xs font-semibold tracking-caption-wide uppercase">社区精选</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-medium text-ink tracking-display-xl leading-tight">社区热门</h1>
          <p className="mt-2 text-sm text-olive max-w-lg">社区推荐的优质 YouTube 英语视频</p>
        </div>
      </section>

      {/* Category tabs */}
      <div className="bg-parchment border-b border-hairline-cream">
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
                    : 'text-olive hover:text-ink hover:bg-cream-soft'
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
        <StaggerContainer className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((item) => (
            <div
              key={item.video_id}
              className="stagger-item group cursor-pointer rounded-lg border border-hairline-cream bg-parchment overflow-hidden hover:border-terracotta/30 hover:shadow-whisper transition-all"
              onClick={() => startLearning(item)}
            >
              <div className="relative aspect-video bg-cream-soft">
                <VideoThumbnail
                  url={item.thumbnail_url}
                  title={item.title}
                  platform="youtube"
                  duration={item.duration}
                  hoverOverlay={<Plus size={36} className="text-ivory opacity-0 group-hover:opacity-100 transition-opacity" />}
                />
              </div>
              <div className="p-3.5">
                <p className="text-sm font-medium text-ink line-clamp-2 leading-snug">{item.title}</p>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-olive">
                  <span className="line-clamp-1">{item.channel_title}</span>
                  {item.view_count && <><span>·</span><span className="shrink-0">{formatViews(item.view_count)} views</span></>}
                </div>
              </div>
            </div>
          ))}
        </StaggerContainer>

        {page === 1 && loading && videos.length === 0 && <SkeletonCardGrid count={8} className="mt-0" />}

        {!loading && videos.length === 0 && (
          <EmptyState icon={Users} title="暂无内容" description="社区还没有视频，来上传第一个吧" />
        )}

        <div ref={loaderRef} className="flex justify-center py-8">
          {page > 1 && loading && <Loader2 size={24} className="animate-spin text-terracotta" />}
          {!hasMore && videos.length > 0 && <p className="text-sm text-olive">已加载全部内容</p>}
        </div>
      </section>
    </main>
    </PageTransition>
  );
}

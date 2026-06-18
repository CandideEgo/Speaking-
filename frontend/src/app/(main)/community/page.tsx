'use client';

import { usePlatformFeed } from '@/hooks/usePlatformFeed';
import { cn } from '@/lib/utils';
import { formatViews } from '@/lib/format';
import { Loader2, Plus, Users } from 'lucide-react';
import { SkeletonCardGrid } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import { PageTransition } from '@/components/PageTransition';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { StaggerContainer } from '@/components/StaggerContainer';

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

export default function CommunityPage() {
  const {
    categories,
    activeCategory,
    setActiveCategory,
    videos,
    loading,
    hasMore,
    loaderRef,
    addingId,
    startLearning,
  } = usePlatformFeed({ platform: 'browse' });

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
                {CATEGORY_ZH[cat.id] || cat.label}
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

        {loading && videos.length === 0 && <SkeletonCardGrid count={8} className="mt-0" />}

        {!loading && videos.length === 0 && (
          <EmptyState icon={Users} title="暂无内容" description="社区还没有视频，来上传第一个吧" />
        )}

        <div ref={loaderRef} className="flex justify-center py-8">
          {loading && videos.length > 0 && <Loader2 size={24} className="animate-spin text-terracotta" />}
          {!hasMore && videos.length > 0 && <p className="text-sm text-olive">已加载全部内容</p>}
        </div>
      </section>
    </main>
    </PageTransition>
  );
}

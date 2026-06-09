'use client';

import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { useHomeFeed } from '@/hooks/useHomeFeed';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { CategoryTabs } from '@/components/channel/CategoryTabs';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonCardGrid } from '@/components/SkeletonCard';
import { PageTransition } from '@/components/PageTransition';
import { StaggerContainer } from '@/components/StaggerContainer';
import type { Video } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const {
    grouped,
    loading,
    error,
    retry,
    difficultyTabs,
    activeDifficulty,
    setActiveDifficulty,
  } = useHomeFeed();

  return (
    <PageTransition>
      <main className="container-page py-16 sm:py-24">
        {/* Header */}
        <div className="mb-8">
          <h2 className="font-display text-3xl font-normal text-ink tracking-display-lg">精选视频</h2>
          <p className="mt-2 text-sm text-muted-foreground">官方精选，适合各个水平的英语内容</p>
        </div>

        {/* Difficulty tabs — using shared CategoryTabs (pill variant) */}
        <CategoryTabs
          categories={difficultyTabs}
          activeId={activeDifficulty}
          onSelect={setActiveDifficulty}
          variant="pill"
        />

        {/* Content */}
        {loading ? (
          <SkeletonCardGrid count={8} className="mt-8" />
        ) : error ? (
          <EmptyState
            icon={Play}
            title="加载失败"
            description={error}
            action={
              <button
                onClick={retry}
                className="rounded-lg bg-coral px-4 py-2 text-sm font-medium text-white hover:bg-coral/90 transition-colors"
              >
                重试
              </button>
            }
            className="mt-8"
          />
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyState
            icon={Play}
            title="暂无视频"
            description="内容正在准备中，请稍后再来"
            className="mt-8"
          />
        ) : (
          Object.entries(grouped).map(([tag, items]) => (
            <section key={tag} className="mb-12">
              <StaggerContainer className="flex items-center gap-3 mb-5">
                <span className="inline-flex items-center rounded-sm bg-cream-soft px-2.5 py-1 text-xs font-semibold text-muted-foreground tracking-caption-wide uppercase">
                  {tag}
                </span>
                <span className="text-xs text-muted-foreground">{items.length} 个视频</span>
              </StaggerContainer>
              <StaggerContainer className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((v) => (
                  <HomeVideoCard
                    key={v.id}
                    video={v}
                    onClick={() => router.push(`/watch/${v.id}`)}
                  />
                ))}
              </StaggerContainer>
            </section>
          ))
        )}
      </main>
    </PageTransition>
  );
}

/**
 * Video card for the home page — uses shared VideoThumbnail with
 * platform-aware icons, error/loaded states, and gradient placeholders.
 */
interface HomeVideoCardProps {
  video: Video;
  onClick: () => void;
}

function HomeVideoCard({ video, onClick }: HomeVideoCardProps) {
  return (
    <button
      onClick={onClick}
      className="group rounded-lg border border-hairline bg-canvas p-0 text-left overflow-hidden hover:border-coral/30 hover:shadow-sm transition-all"
    >
      <div className="relative aspect-video">
        <VideoThumbnail
          url={video.thumbnail_url}
          title={video.title}
          platform={video.platform || 'youtube'}
          duration={video.duration}
          className="h-full w-full"
          hoverOverlay={
            <div className="flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-coral/90 text-white shadow-lg transition-transform group-hover:scale-110">
                <Play size={20} className="ml-0.5" fill="white" />
              </div>
            </div>
          }
        />
      </div>
      <div className="p-3.5">
        <p className="text-sm font-medium text-ink line-clamp-2 leading-snug">{video.title}</p>
        <div className="mt-2.5 flex items-center gap-2">
          {video.difficulty_level && (
            <span className="rounded-sm bg-cream-soft px-1.5 py-0.5 text-xs text-muted-foreground font-medium">
              {video.difficulty_level}
            </span>
          )}
          {video.topic_tags && (
            <span className="text-xs text-muted-foreground truncate">{video.topic_tags.split(',')[0]}</span>
          )}
        </div>
      </div>
    </button>
  );
}

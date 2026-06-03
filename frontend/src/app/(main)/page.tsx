'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Video } from '@/types';
import { Play, Loader2 } from 'lucide-react';

const DIFFICULTIES = ['全部', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export default function HomePage() {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDifficulty, setActiveDifficulty] = useState('全部');

  useEffect(() => {
    api<Video[]>('/api/v1/videos/public')
      .then(setVideos)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    activeDifficulty === '全部'
      ? videos
      : videos.filter((v) => v.difficulty_level === activeDifficulty);

  // Group by first topic tag
  const grouped: Record<string, Video[]> = {};
  for (const v of filtered) {
    const tag = v.topic_tags?.split(',')[0]?.trim() || '其他';
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push(v);
  }

  return (
    <main className="container-page py-16 sm:py-24">
      {/* Header */}
      <div className="mb-8">
        <h2 className="font-display text-3xl font-normal text-ink tracking-display-lg">精选视频</h2>
        <p className="mt-2 text-sm text-muted-foreground">官方精选，适合各个水平的英语内容</p>
      </div>

      {/* Difficulty tabs */}
      <div className="flex items-center gap-1 mb-10 overflow-x-auto scrollbar-hide">
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            onClick={() => setActiveDifficulty(d)}
            className={`
              shrink-0 rounded-md px-4 py-2 text-sm font-medium transition-colors
              ${activeDifficulty === d
                ? 'bg-coral text-white'
                : 'bg-cream-soft text-muted-foreground hover:text-ink hover:bg-cream-card'}
            `}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-coral" />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border-2 border-dashed border-hairline py-20">
          <Play size={32} className="text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">暂无视频</p>
          <p className="mt-1 text-xs text-muted-foreground">内容正在准备中，请稍后再来</p>
        </div>
      ) : (
        Object.entries(grouped).map(([tag, items]) => (
          <section key={tag} className="mb-12">
            <div className="flex items-center gap-3 mb-5">
              <span className="inline-flex items-center rounded-sm bg-cream-soft px-2.5 py-1 text-xs font-semibold text-muted-foreground tracking-caption-wide uppercase">
                {tag}
              </span>
              <span className="text-xs text-muted-foreground">{items.length} 个级视频</span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((v) => (
                <button
                  key={v.id}
                  onClick={() => router.push(`/watch/${v.id}`)}
                  className="group rounded-lg border border-hairline bg-canvas p-0 text-left overflow-hidden hover:border-coral/30 hover:shadow-sm transition-all"
                >
                  <div className="relative aspect-video bg-cream-soft flex items-center justify-center">
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} alt={v.title} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <Play size={32} className="text-muted-foreground group-hover:text-coral transition-colors" />
                    )}
                    {v.duration && (
                      <span className="absolute bottom-2 right-2 rounded-sm bg-ink/80 px-1.5 py-0.5 text-xs text-white font-medium">
                        {Math.floor(v.duration / 60)}:{String(Math.floor(v.duration % 60)).padStart(2, '0')}
                      </span>
                    )}
                  </div>
                  <div className="p-3.5">
                    <p className="text-sm font-medium text-ink line-clamp-2 leading-snug">{v.title}</p>
                    <div className="mt-2.5 flex items-center gap-2">
                      {v.difficulty_level && (
                        <span className="rounded-sm bg-cream-soft px-1.5 py-0.5 text-xs text-muted-foreground font-medium">{v.difficulty_level}</span>
                      )}
                      {v.topic_tags && (
                        <span className="text-xs text-muted-foreground truncate">{v.topic_tags.split(',')[0]}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}

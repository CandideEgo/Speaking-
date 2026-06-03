'use client';

import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';
import { VideoStatusBadge } from './VideoStatus';
import type { Video } from '@/types';
import { cn } from '@/lib/utils';

interface VideoLibraryProps {
  videos: Video[];
}

export default function VideoLibrary({ videos }: VideoLibraryProps) {
  const router = useRouter();

  return (
    <section className="container-page pb-16">
      <h2 className="font-display text-2xl font-normal text-ink tracking-display-md">我的视频库</h2>
      {videos.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-lg border-2 border-dashed border-hairline py-16">
          <Play size={32} className="text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">还没有视频</p>
          <p className="mt-1 text-xs text-muted-foreground">粘贴一个链接，开启第一课。</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <button
              key={v.id}
              onClick={() =>
                (v.status === 'ready' || v.status === 'ready_subtitles') &&
                router.push(`/watch/${v.id}`)
              }
              disabled={v.status !== 'ready' && v.status !== 'ready_subtitles'}
              className={cn(
                'group rounded-lg border border-hairline bg-canvas p-0 text-left overflow-hidden hover:border-coral/30 hover:shadow-sm transition-all',
                'disabled:cursor-default disabled:hover:border-hairline disabled:hover:shadow-none'
              )}
            >
              <div className="relative aspect-video bg-cream-soft flex items-center justify-center">
                {v.thumbnail_url ? (
                  <img
                    src={v.thumbnail_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Play
                    size={32}
                    className="text-muted-foreground group-hover:text-coral transition-colors"
                  />
                )}
                {v.duration && (v.status === 'ready' || v.status === 'ready_subtitles') && (
                  <span className="absolute bottom-2 right-2 rounded-sm bg-ink/80 px-1.5 py-0.5 text-xs text-white">
                    {Math.floor(v.duration / 60)}:
                    {String(Math.floor(v.duration % 60)).padStart(2, '0')}
                  </span>
                )}
              </div>
              <div className="p-3.5">
                <p className="text-sm font-medium text-ink line-clamp-2">
                  {v.title === 'Processing...' ? '处理中...' : v.title}
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <VideoStatusBadge status={v.status} />
                  {v.difficulty_level && (
                    <span className="rounded-sm bg-cream-soft px-1.5 py-0.5 text-xs text-muted-foreground">
                      {v.difficulty_level}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

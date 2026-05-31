'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Video } from '@/types';
import { Play, Loader2 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Video[]>('/api/v1/videos/public')
      .then(setVideos)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container-page py-6">
      <section className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">精选视频</h1>
        <p className="mt-1 text-sm text-slate-500">AI 驱动的英语口语学习内容</p>
      </section>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin text-brand-600" />
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 py-20">
          <Play size={32} className="text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-500">暂无视频</p>
          <p className="mt-1 text-xs text-slate-400">视频正在准备中，请稍后再来</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {videos.map((v) => (
            <button
              key={v.id}
              onClick={() => router.push(`/watch/${v.id}`)}
              className="group rounded-xl border border-slate-200 bg-white p-0 text-left overflow-hidden hover:border-brand-300 hover:shadow-lg transition-all"
            >
              <div className="relative aspect-video bg-slate-100 flex items-center justify-center">
                {v.thumbnail_url ? (
                  <img
                    src={v.thumbnail_url}
                    alt={v.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Play size={32} className="text-slate-300 group-hover:text-brand-400 transition-colors" />
                )}
                {v.duration && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs text-white font-medium">
                    {Math.floor(v.duration / 60)}:{String(Math.floor(v.duration % 60)).padStart(2, '0')}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium text-slate-900 line-clamp-2 leading-snug">
                  {v.title}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {v.difficulty_level && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-500">
                      {v.difficulty_level}
                    </span>
                  )}
                  {v.topic_tags && (
                    <span className="text-xs text-slate-400 truncate">
                      {v.topic_tags.split(',')[0]}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

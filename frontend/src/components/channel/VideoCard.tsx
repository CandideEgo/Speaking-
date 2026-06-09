'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Play, MessageSquare, Clock, Eye } from 'lucide-react';

interface VideoItem {
  video_id: string;
  url: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  duration: number | null;
  view_count: number | null;
}

interface VideoCardProps {
  video: VideoItem;
  variant: 'youtube' | 'bilibili' | 'douyin';
  onClick: () => void;
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

function gradientFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [15, 30, 45, 200, 220, 260, 340];
  const h1 = hues[Math.abs(hash) % hues.length];
  const h2 = hues[(Math.abs(hash >> 3) + 3) % hues.length];
  return `linear-gradient(135deg, hsl(${h1}, 80%, 58%), hsl(${h2}, 75%, 48%))`;
}

function VideoThumbnailImage({ url, title }: { url: string | null; title: string }) {
  const [status, setStatus] = useState<'loading' | 'error' | 'loaded'>('loading');
  const bgStyle = useMemo(() => gradientFromString(title), [title]);

  return (
    <div className="relative aspect-video overflow-hidden">
      {url && status !== 'error' && (
        <img
          src={url}
          alt={title}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          )}
          loading="lazy"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}
      {status === 'loading' && url && (
        <div className="absolute inset-0 animate-pulse bg-gray-700" />
      )}
      {(!url || status === 'error') && (
        <div
          className="absolute inset-0 flex items-center justify-center text-white/90"
          style={{ background: bgStyle }}
        >
          <span className="text-2xl font-bold tracking-tight">{title.trim().charAt(0).toUpperCase()}</span>
        </div>
      )}
    </div>
  );
}

export function VideoCard({ video, variant, onClick }: VideoCardProps) {
  if (variant === 'youtube') {
    return (
      <div
        onClick={onClick}
        className="group cursor-pointer flex flex-col gap-2"
      >
        <div className="relative aspect-video overflow-hidden rounded-lg">
          <VideoThumbnailImage url={video.thumbnail_url} title={video.title} />
          {video.duration && video.duration > 0 && (
            <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {formatDuration(video.duration)}
            </span>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
            <Play size={36} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-xs font-bold text-gray-600">{video.channel_title?.charAt(0) || 'U'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#0f0f0f] line-clamp-2 leading-snug">{video.title}</p>
            <p className="text-xs text-[#606060] mt-0.5">{video.channel_title}</p>
            <p className="text-xs text-[#606060]">{formatViews(video.view_count)} views</p>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'bilibili') {
    return (
      <div
        onClick={onClick}
        className="group cursor-pointer flex flex-col gap-2"
      >
        <div className="relative aspect-video overflow-hidden rounded-xl">
          <VideoThumbnailImage url={video.thumbnail_url} title={video.title} />
          {video.duration && video.duration > 0 && (
            <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {formatDuration(video.duration)}
            </span>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
            <Play size={36} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-white text-[11px]">
            <Eye size={12} />
            <span>{formatViews(video.view_count)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#18191c] line-clamp-2 leading-snug">{video.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-[#9499a0]">{video.channel_title}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-[#9499a0]">
              <span className="flex items-center gap-1">
                <Eye size={12} />
                {formatViews(video.view_count)}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare size={12} />
                {(video.view_count ? Math.floor(video.view_count / 100) : 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // douyin
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer flex flex-col gap-2"
    >
      <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-[#1a1a1a]">
        <VideoThumbnailImage url={video.thumbnail_url} title={video.title} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
          <Play size={40} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="absolute bottom-2 left-2 right-2">
          <p className="text-sm font-medium text-white line-clamp-2 leading-snug drop-shadow-lg">{video.title}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-300">
            <span>{video.channel_title}</span>
            {video.view_count && <span>· {formatViews(video.view_count)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

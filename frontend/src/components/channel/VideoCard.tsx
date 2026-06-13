'use client';

import { useState, useMemo } from 'react';
import { Loader2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration, formatViews } from '@/lib/format';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import type { VideoItem } from '@/types/platform';

interface VideoCardProps {
  video: VideoItem;
  variant: 'youtube' | 'bilibili' | 'douyin';
  onClick: () => void;
  isLoading?: boolean;
}

export function VideoCard({ video, variant, onClick, isLoading }: VideoCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);

  if (variant === 'youtube') {
    return (
      <div onClick={onClick} className="group cursor-pointer flex flex-col gap-2">
        <div className="relative aspect-video overflow-hidden rounded-lg">
          <VideoThumbnail
            url={video.thumbnail_url}
            title={video.title}
            platform="youtube"
            duration={video.duration}
            className="h-full w-full"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
            <Play size={36} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {isLoading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg">
              <Loader2 size={24} className="animate-spin text-white" />
            </div>
          )}
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
      <div onClick={onClick} className="group cursor-pointer flex flex-col gap-2">
        <div className="relative aspect-video overflow-hidden rounded-xl">
          <VideoThumbnail
            url={video.thumbnail_url}
            title={video.title}
            platform="bilibili"
            duration={video.duration}
            className="h-full w-full"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
            <Play size={36} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          {isLoading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
              <Loader2 size={24} className="animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#18191c] line-clamp-2 leading-snug">{video.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-[#9499a0]">{video.channel_title}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-[#9499a0]">
            <span className="flex items-center gap-1">
              {formatViews(video.view_count)} views
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Douyin — vertical card with 9:16 thumbnail
  return (
    <div onClick={onClick} className="group cursor-pointer flex flex-col gap-2">
      <div className="relative aspect-[9/16] overflow-hidden rounded-2xl">
        <VideoThumbnail
          url={video.thumbnail_url}
          title={video.title}
          platform="douyin"
          duration={video.duration}
          className="h-full w-full"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
          <Play size={40} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-2xl">
            <Loader2 size={24} className="animate-spin text-white" />
          </div>
        )}
      </div>
      <div className="px-1">
        <p className="text-sm font-medium text-[#18191c] line-clamp-2 leading-snug">{video.title}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-[#9499a0]">
          <span className="line-clamp-1">{video.channel_title}</span>
          {video.view_count && (
            <>
              <span>·</span>
              <span className="shrink-0">{formatViews(video.view_count)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
